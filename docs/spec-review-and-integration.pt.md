[English](spec-review-and-integration.md) · **Português**

# Spec: revisão de código e integração com a Clínica Fácil

Duas partes, nesta ordem. A árvore está limpa: o último commit é `8eca669`, a entrega de UX.

## Parte 1: revisão de código, com correção

Revise o repo inteiro com olhar de quem vai manter o código. A base é o diff contra o kit (o
commit `adonis-web-kit` inicial do histórico) mais tudo de telemed. Compare com:

- **as regras do kit** (`CLAUDE.md`, `AGENTS.md`):
  - módulo em `app/modules/<domínio>/`, na cadeia controller → service → repository → model,
    com `routes.ts` próprio;
  - só os aliases `#modules/*` e `#shared/*`, sem import relativo `../../`;
  - VineJS em toda entrada;
  - `app/types/inertia.ts` tipado, sem `Record<string, any>`;
  - schema no `create_*` original (estamos antes da 1.0);
  - código em inglês e texto de interface em pt-BR;
- **segurança**:
  - isolamento entre tenants em toda query (recurso alheio responde 404);
  - a página pública não vaza dados de quem está logado;
  - `X-Forwarded-Host` só vale com `TRUST_PROXY`;
  - segredos cifrados (`webhook_secret`);
  - comparação em tempo constante onde houver hash e assinatura;
  - rate limit nas rotas públicas e na API;
  - logs sem CPF nem dado clínico;
  - o metadata do LiveKit leva só `{ role }`;
- **regras clínicas** (`docs/brazil-telemedicine-rules.pt.md`):
  - consentimento versionado, com hash;
  - sem token de vídeo antes de consentir e ser admitido;
  - `canAttend` exclusivo do médico da consulta;
  - audit append-only;
- **qualidade**:
  - código morto do kit que o produto não usa (demos, telas genéricas): remova o que é seguro
    remover e liste o resto;
  - duplicação;
  - serviço gordo demais;
  - N+1;
  - teste que só repete a implementação;
  - nome que não diz o que faz.

Corrija o que for claro. Cada achado vira uma linha no relatório: **aplicado** ou **descartado
porque…**. Regra de negócio e de autorização **não afrouxa**. Se a correção for apertar uma
regra, aperte, com teste. A decisão que é do dono vai para "Perguntas ao dono" no relatório, sem
implementar.

Pendências já conhecidas, que entram na revisão:

- o cookie `telemed_patient` é um só por navegador e deveria ser por consulta;
- o `PublicClinicService` carrega todos os tenants ativos a cada requisição;
- o JWT de vídeo de 60 s não é revogável, mas o `finish` apaga a sala: confira se isso basta;
- o `pnpm build` não roda desde a primeira rodada.

## Parte 2: integração com a Clínica Fácil

A Clínica Fácil (`~/Projects/personal/clinicafacil`) é o primeiro integrador. O open-telemed
existe para que ela ofereça teleconsulta.

**A Clínica Fácil é só leitura.** Não edite nada lá. Não rode testes, `pnpm dev`, migration nem
seed dela: o banco de dev é compartilhado e há outras sessões trabalhando naquele checkout.

### Entenda o lado de lá

Leia o `CLAUDE.md` dela e as regras de área, principalmente:

- `.claude/rules/agenda.md`, `agenda-atendimento.md`, `agenda-equipe.md` e
  `agenda-assistente*.md`;
- `whatsapp.md`, `whatsapp-envio.md` e `whatsapp-assistente*.md`;
- `features.md` (módulos e gate), `tenancy.md` e `rbac.md`.

Depois, o código de `app/modules/agenda/`, `whatsapp/`, `team/`, `features/` e `patient_records/`.

Responda para você mesmo:

- O que é uma consulta lá: tabela, status, profissional e paciente.
- Como o profissional é modelado e se existe CRM.
- Como o paciente recebe mensagem (envio de WhatsApp, templates).
- Como um módulo novo seria ligado (`FEATURE_KEYS`).
- Onde o desfecho da teleconsulta deveria voltar: atendimento ou prontuário.

### Ajuste o open-telemed para a integração ficar boa

Implemente aqui, com teste e OpenAPI atualizado, o que for claramente necessário e contido. A
lista abaixo é o ponto de partida; o que a leitura mostrar que faz mais sentido manda nela.

- **Idempotência**: `external_id` único por tenant. Repetir o `POST /consultations` com o mesmo
  `external_id` devolve a consulta existente, sem duplicar, e não gera link novo sem pedido.
- **Remarcar e atualizar**: mudar horário ou profissional de uma consulta ainda `scheduled`.
- **Reemitir o link do paciente pela API**, para o integrador reenviar no WhatsApp. O segredo só
  aparece na resposta da emissão.
- **Profissional**: como o integrador aponta o médico (por id do open-telemed, por CRM/UF ou por
  um `external_id` do profissional) e, se fizer sentido, provisionar o profissional pela API.
- **Webhook de saída** com o que a Clínica Fácil precisa para conciliar:
  - `external_id`, `event_id` único (para deduplicar), status, outcome, horários e
    profissional (CRM/UF);
  - assinatura HMAC com timestamp, contra replay;
  - o contrato documentado.
- **Mapeamento de tenant**: um negócio da Clínica Fácil corresponde a uma clínica do open-telemed.
  Decida entre um token de serviço por clínica e um integrador de plataforma com `X-Tenant-Id`,
  justificando.

**Proposta, sem implementar** (mexe em auth, então é decisão do dono): como o médico entra na
sala a partir da agenda da Clínica Fácil sem um segundo login. Exemplo: um link de entrada
assinado, de uso único e curto, pedido pelo integrador. Descreva no documento o desenho, os
riscos e a alternativa.

### Documento para o lado da Clínica Fácil

Crie `docs/clinicafacil-integration.pt.md`, que vira a base do ticket e da spec que a Clínica Fácil
fará no fluxo dela. Ele cobre:

- o contrato (endpoints, payloads, webhook, erros, idempotência);
- o fluxo de ponta a ponta: marcar teleconsulta na agenda → criar no open-telemed → link pelo
  WhatsApp → paciente consente e espera → médico admite → desfecho volta;
- o que muda na Clínica Fácil, com os módulos e arquivos dela que seriam tocados, o módulo ou
  feature key novo e a migration;
- as invariantes dela que a integração precisa respeitar, citando a regra;
- as perguntas ao dono.

Até 200 linhas.

## Ambiente e portão

- O `pnpm dev` na 3333 pode estar rodando: se atrapalhar, pare e, no fim, deixe rodando de novo.
- Node 24: `mise exec node@24.21.0 -- pnpm …`.
- As suítes rodam num scope com memória limitada e poucos workers, como na rodada anterior.
- **Não faça commit**: quem commita é o dono.
- Portão: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm test:ui` e `pnpm build` passam.

## Entrega

- `docs/review-report.pt.md`: os achados da revisão (aplicado ou descartado, com o porquê), o
  que mudou para a integração, as perguntas ao dono e o portão com números.
- `docs/clinicafacil-integration.pt.md`.
- No chat, um resumo curto com o portão.
