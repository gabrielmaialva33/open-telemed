[English](implementation-report.md) · **Português**

# Relatório de implementação — Open Telemed

Data: 26/11/2026. Escopo: seções 0–5 de `docs/spec-telemed.pt.md`.

## Resultado

Os cinco critérios de aceite foram atendidos no ambiente de desenvolvimento: verificações verdes, cobertura Japa dos controles exigidos, seed de duas clínicas, chamada real pelo LiveKit entre dois contextos de navegador com câmera falsa e README em pt-BR.

Trabalho feito no checkout local, sem `git add`, commit, push ou troca de branch. A base staged foi preservada. Arquivos novos continuam untracked; portanto não aparecem no `git diff` comum até serem adicionados pelo revisor.

## O que foi feito

- Produto renomeado para Open Telemed, pacote `open-telemed` 0.1.0, AGPL-3.0-only, URLs do repositório original retiradas. `NOTICE` identifica a origem MIT e `LICENSE-adonis-web-kit-MIT` foi preservada. README único em português; cadastro público e demos desligados por padrão.
- Compose com projeto `open-telemed`, PostgreSQL 5434, Redis 6381, Mailpit 1026/8026 e LiveKit 7880/7881/7882-UDP. `.env` local, exemplo, teste e validação das variáveis ajustados. Banco de teste e Redis DB 15 separados do desenvolvimento.
- Clínica com marca, domínios autorizados, identificação legal e segredo de webhook cifrado. Perfis médicos com CRM/UF/RQE; cadastro de usuário novo ou vínculo de membro existente. O vínculo atribui o papel de médico e invalida o cache de permissões para liberar o acesso imediatamente.
- Consultas isoladas por tenant, vínculo profissional validado também por chave estrangeira composta, estados e desfechos, horários, identificação/local informado do paciente, modalidade e retenção mínima configurável de 20 anos.
- Termos versionados por clínica, hash SHA-256, aceite explícito com IP, navegador e representante opcional. A escolha de gravação é separada, desmarcada por padrão e não ativa gravação. Termos, aceites e auditoria clínica são protegidos contra UPDATE/DELETE por triggers PostgreSQL.
- Link com segredo no fragmento, hashes no banco e troca por sessão anônima HttpOnly, SameSite Strict e Secure em produção. O fragmento é retirado antes da inicialização do Inertia. Sessão expirada, link expirado e clínica incompatível são recusados.
- Fluxo público com prévia de câmera, medidor de microfone, termo, espera por polling de 2 segundos, entrada após admissão, vídeo e opção de atendimento presencial. Rodapé com dados legais da clínica. Props públicas não incluem usuário autenticado ou flashes.
- Painel de consultas, criação, detalhe/link, sala do médico, admissão e encerramento com desfecho; telas de profissionais, marca, dados legais, termos e webhook. Responsividade conferida a 390 e 1280 px.
- RBAC do kit com papéis de dono da clínica, médico e integrador. Médico acessa consultas próprias por ownership. Operações administrativas exigem papel no tenant ativo. A API usa tokens opacos do kit, abilities e permissões; recurso de outra clínica responde 404.
- Vídeo pelo serviço compartilhado: sala `t<tenantId>-<consultationId>`, limite de duas pessoas, JWT de ingresso de 60 segundos restrito à sala, primeiro nome de exibição e metadata somente `{ role }`. Controles em português e encerramento da sala pelo backend.
- Entrada LiveKit validada sobre corpo bruto pelo `WebhookReceiver`; eventos de entrada, saída e término, deduplicação e proteção contra reativação por eventos atrasados. Auditoria das transições, consentimento, admissão e desfecho.
- Saída com outbox persistida na mesma transação do estado, job Bull, HMAC-SHA256, seis tentativas com backoff exponencial e timeout de 10 segundos. A fila recebe apenas o identificador da entrega. Comando de recuperação de eventos ainda não enfileirados.
- Respostas/logs de falhas clínicas não incluem SQL ou bindings de documentos. Conflito de identificador externo retorna 409. Auditoria sanitiza campos sensíveis e não guarda o payload clínico.

Na interface do kit, removi o Tailwind externo duplicado e o reset universal sem layer que anulava os espaçamentos. Ajustei o cabeçalho móvel e o limite de altura da barra LiveKit para os controles não ficarem cortados. Os testes de cadastro/demos herdados habilitam explicitamente esses modos apenas no próprio teste; os padrões do produto permanecem desligados.

## Arquivos principais

| Área                    | Arquivos                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Consultas e integração  | `app/modules/consultations/{controllers,services,repositories,models,validators,jobs}/`, `routes.ts`                                            |
| Termos                  | `app/modules/consents/models/`, `services/consent_text_service.ts`                                                                              |
| Profissionais e painel  | `app/modules/professionals/`                                                                                                                    |
| Clínica                 | `app/modules/tenants/models/tenant.ts`, `services/branding_service.ts`, `services/public_clinic_service.ts`, `validators/branding_validator.ts` |
| Vídeo e ownership       | `app/shared/services/video_service.ts`, `ownership_service.ts`                                                                                  |
| Privacidade e auditoria | `app/exceptions/handler.ts`, `app/shared/middleware/inertia_middleware.ts`, `app/modules/audits/`                                               |
| Interface               | `inertia/pages/telemed/`, `inertia/components/telemed/`, `inertia/css/telemed.css`                                                              |
| Infra e jobs            | `docker-compose.yml`, `start/env.ts`, `config/queue.ts`, `commands/dispatch_webhooks.ts`                                                        |
| Seed                    | `database/seeders/tenant_seeder.ts`, `user_seeder.ts`                                                                                           |
| Contrato                | `docs/openapi.yaml`, `README.md`                                                                                                                |
| Regressões              | `tests/functional/telemed/`, `tests/browser/telemed/consultation.spec.ts`, `inertia/tests/telemed/consent_form.test.tsx`                        |

O OpenAPI foi convertido de 3.1 para 3.0.3 porque o validador instalado no kit aceita 3.0. O plugin de assertions foi conectado ao bootstrap e a resposta de criação de consulta é conferida contra o contrato. Os endpoints anteriores foram mantidos.

## Migrations e seed

Foram ajustadas as migrations originais de `tenants`, permissões/papéis e `audit_logs`, conforme a política anterior à versão 1.0. Foram acrescentadas sete migrations, `1795600000000` a `1795600000006`, criando:

1. `professionals`;
2. `consent_texts`;
3. `consultations`;
4. `consents`;
5. `patient_links`;
6. `webhook_deliveries`;
7. `livekit_events`.

O banco de desenvolvimento deste projeto foi recriado, recebeu as 23 migrations e o seed. Verificação SQL final: Aurora, cor `#0f766e`, um profissional e uma consulta; Horizonte, cor `#6d48a5`, um profissional e uma consulta. Cada clínica tem administrador, médico e usuário de serviço. O seed imprime logins, links e tokens fictícios; tokens e segredos não estão reproduzidos neste relatório. O teste usa seu próprio banco e reverte as migrations ao terminar.

## Como rodar

Use Node 24, como em `.nvmrc`. Nesta execução os comandos foram prefixados com `mise exec node@24.21.0 --`.

```sh
pnpm install --frozen-lockfile
# Apenas em uma instalação nova, sem .env:
cp .env.example .env
pnpm ace generate:key

docker context ls
# Confirmar que o contexto Docker aponta para o host de dev.
docker compose up -d --no-recreate postgres redis mailpit livekit
# Apenas se o banco de teste ainda não existir:
docker compose exec -T postgres createdb -U postgres open_telemed_test

pnpm ace migration:run
pnpm ace db:seed
pnpm dev
```

Neste checkout, `.env`, bancos, migrations e seed já estão preparados; não é necessário copiar novamente o arquivo nem regenerar a chave. Abra `http://localhost:3333`. O README lista os logins fictícios e a senha de demonstração. Para novos links/tokens de seed, rode novamente `pnpm ace db:seed`.

Em outro terminal, para entrega de webhooks:

```sh
pnpm ace queue:listen --queue=consultation-webhooks
# Recuperação de eventos persistidos que não chegaram à fila:
pnpm ace telemed:dispatch-webhooks
```

A recuperação não reinicia automaticamente jobs que já esgotaram as seis tentativas. Esses casos permanecem na outbox para intervenção operacional. Não foi deixado servidor de desenvolvimento ou worker permanente em execução; os quatro containers da infra permanecem ativos no host Docker de dev.

O LiveKit preexistente foi reaproveitado, sem recriação: ID iniciado por `c9e982fcce3c`, iniciado em `2026-11-25T22:00:10Z`. PostgreSQL, Redis e Mailpit estavam saudáveis na conferência final. Nenhum container de outro projeto foi alterado.

Ocorrência durante o preparo: uma falha no script de alteração do Compose deixou uma chamada inicial usar a configuração antiga, que tentou publicar 6379 e foi recusada por colisão. Os três containers novos `adonis-web-kit-*` permaneceram em estado Created e foram removidos, junto com a rede criada nessa tentativa. Não foi derrubado serviço existente nem removido volume. Em seguida, o Compose corrigido subiu exclusivamente nas portas da spec.

## Validação executada

| Comando                       | Resultado final                                                         |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0, nenhum erro ESLint                                              |
| `pnpm typecheck`              | Exit 0, backend e frontend                                              |
| `pnpm test:e2e`               | **214 testes passaram**, 34 segundos; unitários, funcionais e navegador |
| `pnpm test:ui --maxWorkers=4` | **58 testes passaram em 10 arquivos**, 1,67 segundo                     |
| `pnpm build`                  | Exit 0, bundles cliente/SSR e compilação backend                        |
| `git diff --check`            | Sem problemas de whitespace                                             |

As suítes Japa foram executadas sequencialmente, sem processos Japa concorrentes. Vitest foi limitado a quatro workers. Testes e build rodaram em scope systemd com `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G` e `OOMPolicy=kill`.

```sh
TELEMED_SCREENSHOT_DIR="$PWD/docs/screenshots" \
  systemd-run --user --scope -p MemoryHigh=8G -p MemoryMax=10G \
  -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:e2e

systemd-run --user --scope -p MemoryHigh=8G -p MemoryMax=10G \
  -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:ui --maxWorkers=4
```

Os testes de telemedicina verificam todos os oito cenários Japa pedidos na spec. Também cobrem sessão/link expirados, aceite imutável, webhooks assinados e adulterados, replay, exportação RAC, abilities do token, conflito de identificador sem exposição do documento, médico criado a partir de membro existente com permissões previamente em cache e entrega HTTP assinada com falha 503 seguida de sucesso e deduplicação. O teste da entrega chama o handler do job novamente; não mede o agendamento temporal do backoff em um worker separado.

O navegador usa `--use-fake-device-for-media-stream` e `--use-fake-ui-for-media-stream`, com dois contextos isolados. Verifica dois vídeos com frames decodificados em cada página, as identidades médico/paciente na sala real e `maxParticipants=2`. Confere ainda fragmento removido, gravação desmarcada, encerramento com encaminhamento presencial, recusa do paciente na clínica B, ausência de exceções JavaScript e ausência de overflow/corte dos controles nas duas larguras.

Prints gerados e inspecionados:

| Tela                       | Desktop                                         | Celular                                       |
| -------------------------- | ----------------------------------------------- | --------------------------------------------- |
| Aurora, preparação e termo | [1280 px](screenshots/aurora-consent-1280.png)    | [390 px](screenshots/aurora-consent-390.png)    |
| Paciente em espera         | —                                               | [390 px](screenshots/aurora-waiting-390.png)   |
| Médico antes da admissão   | [1280 px](screenshots/doctor-waiting-1280.png)   | —                                             |
| Vídeo do paciente          | [1280 px](screenshots/patient-video-1280.png)  | [390 px](screenshots/patient-video-390.png)  |
| Vídeo do médico            | [1280 px](screenshots/doctor-video-1280.png)    | [390 px](screenshots/doctor-video-390.png)    |
| Horizonte, outra marca     | [1280 px](screenshots/horizonte-consent-1280.png) | [390 px](screenshots/horizonte-consent-390.png) |

Logs resumidos acima; arquivos completos em `~/.cache/agents/2026-11-26-open-telemed-implementation/{lint-final,typecheck-final,e2e-final,ui-final,build-final}.log`. O log de seed nesse diretório tem permissão 600 e contém apenas credenciais/links sintéticos de desenvolvimento.

Avisos não bloqueantes observados: configuração local do pnpm com referência a `NODE_AUTH_TOKEN` ausente, aviso Vite de chunk acima de 500 kB e mensagens do SDK LiveKit sobre fechamento de DataChannels ao encerrar a sala. Não houve falha das verificações por esses avisos.

## Fora desta etapa e limites verificados

- Conforme a spec: receita/atestado e ICP-Brasil, gravação, FHIR/RNDS, consulta ao CFM e aplicativo mobile não foram implementados.
- Teste de mídia com Chromium e dispositivos falsos; não houve teste com câmera física, celulares reais, Safari/Firefox, rede pública/TURN ou carga. O microfone é solicitado e há medidor na prévia; não houve avaliação humana da qualidade de áudio.
- O LiveKit no host Docker de dev não envia webhooks para esta máquina no ambiente de desenvolvimento. A entrada foi validada com payloads assinados pelo SDK, incluindo adulteração e replay. Produção precisa configurar o destino do webhook e HTTPS/WSS.
- JWT de vídeo já emitido pode ser reapresentado até expirar em 60 segundos no LiveKit self-hosted. O backend bloqueia novas emissões após término e fecha a sala; não existe revogação central adicional nesta etapa.
- A proteção de imutabilidade foi validada em PostgreSQL. `retain_until` registra a política; não constitui solução de backup, guarda documental certificada ou prontuário/SRES. Não há purga automática dos registros clínicos.
- Não houve deploy nem homologação jurídica ou clínica. Os dados legais do seed são fictícios; o formato do CRM é validado, a regularidade profissional não.

Índice Git conferido antes e depois: SHA-256 de `git ls-files -s` igual a `fef66978eb603340f5224db08c51696d4719fdc5c03a5f456fdb44519e652b2c`.

## Correção de sigilo

Revisão de 26/11/2026: confirmado e corrigido o acesso indevido do manager ao atendimento de outro profissional. Antes da correção, os testes reproduziram respostas 200 onde eram exigidas respostas 403 para dono da clínica, admin e root.

`ConsultationAccessService.canAttend` exige ownership da consulta no tenant ativo: a checagem do kit vincula `consultations.professional_id` a `professionals.id`, confere o mesmo tenant e `professionals.user_id` igual ao usuário autenticado. Esse requisito precede qualquer autorização por papel ou permissão. Depois dele, verifica-se `consultations.attend.own`. A admissão, o token do médico e o endpoint de encerramento passam obrigatoriamente por essa regra; nem permissões amplas antigas contornam a identidade profissional.

Removi `consultations.attend` sem contexto tanto da migration original de permissões quanto do serviço que gera o catálogo. Permanece `consultations.attend.own`, utilizável somente nas consultas do próprio profissional, inclusive quando ele também é dono da clínica. Não foi criada migration adicional. Na base local `open_telemed`, removi o único registro da permissão obsoleta e seus vínculos por cascade; a conferência passou a retornar apenas `consultations.attend.own`. A invalidação de cache ficou restrita ao namespace ACL do Redis deste projeto. Não foi necessário recriar o banco ou alterar dados clínicos.

O controller fornece `canAttend` à página de detalhe e exige atendimento autorizado também no acesso direto a `/consultations/:id/room`. O manager que não é o médico continua vendo os detalhes administrativos, mas não vê admissão, ingresso na sala, link para a sala, vídeo, seletor de desfecho ou encerramento. O cancelamento de consulta que ainda não começou continua disponível. O endpoint `end` permanece inteiramente restrito ao profissional, inclusive para `no_show`.

Arquivos principais desta correção:

- `app/modules/consultations/services/consultation_access_service.ts`;
- `app/modules/consultations/controllers/consultations_controller.ts`;
- `app/modules/permissions/services/create_default_permissions_service.ts`;
- `database/migrations/1752435661561_create_default_permissions.ts`;
- `inertia/pages/telemed/consultation.tsx`;
- `tests/functional/telemed/clinical_access.spec.ts` e ajuste da fixture em `consultations.spec.ts`;
- `inertia/tests/telemed/clinical_access.test.tsx`.

Regressões novas: dono/admin/root não responsáveis e médico de outra consulta no mesmo tenant recebem 403 em `admit`, `video-token` e `end` com `completed` ou `referred_in_person`, sem alterar o estado. Um grant amplo obsoleto, inserido deliberadamente no teste, também é recusado. O dono que é o profissional consegue admitir, receber token com seu próprio nome e encerrar com ambos os desfechos. Há cobertura de leitura administrativa, bloqueio da rota da sala, cancelamento antes da admissão, catálogo sem permissão ampla e controles do painel nos estados de espera e atendimento.

Evidência RED/GREEN: antes da correção, **15 falhas em 21 regressões Japa** e **2 falhas em 4 regressões de interface**; depois, **21/21** e **4/4** passaram. A execução final das suítes completas, após todas as alterações, produziu:

| Comando                       | Saída resumida                                                    |
| ----------------------------- | ----------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0; nenhum erro ESLint                                        |
| `pnpm typecheck`              | Exit 0; backend e frontend                                        |
| `pnpm test:e2e`               | `Tests 235 passed (235)`; 33 segundos                             |
| `pnpm test:ui --maxWorkers=4` | `Test Files 11 passed (11)`; `Tests 62 passed (62)`; 1,59 segundo |
| `git diff --check`            | Exit 0                                                            |

Todos os quatro comandos usaram Node 24.21.0 e scope systemd com `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G` e `OOMPolicy=kill`. Japa sem processos de suíte concorrentes; Vitest com no máximo quatro workers. A suíte completa repetiu também a chamada entre os dois navegadores pelo LiveKit. Não foi repetido o build nesta correção.

Logs: `~/.cache/agents/2026-11-26-open-telemed-sigilo/{backend-red,backend-green,ui-red,ui-green,lint-final,typecheck-final,e2e-final,ui-final}.log`. Os prints da repetição do fluxo existente estão em `screenshots/` dentro desse diretório de scratch. Permaneceram os avisos não bloqueantes de pnpm e de fechamento de DataChannels já registrados acima.

Sem commit e sem `git add`. O SHA-256 do índice continua exatamente igual ao registrado na entrega inicial.
