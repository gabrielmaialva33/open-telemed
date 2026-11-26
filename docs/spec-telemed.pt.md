[English](spec-telemed.md) · **Português**

# Spec: open-telemed sobre o adonis-web-kit

Este repo nasceu do `adonis-web-kit` (AdonisJS 7 + React 19 + Inertia, módulos por domínio,
multi-tenancy N:N, RBAC, audits, files). Meta: **teleconsulta 1:1 multi-tenant e white label**.
Cada clínica é um tenant com marca própria, e o fluxo legal do paciente é termo → espera →
admitido → vídeo (LiveKit). O porquê de cada regra está em `docs/brazil-telemedicine-rules.pt.md`.
O código de referência do vídeo, uma prova de conceito que funciona, está em
`~/.cache/agents/2026-11-26-open-telemed-poc/` (`server.ts` e `src/main.tsx`).

Antes de codar, leia `CLAUDE.md` e `AGENTS.md`. As regras do kit valem: módulos em
`app/modules/<domínio>/`, só os aliases `#modules/*` e `#shared/*`, `pnpm ace` e, antes da 1.0,
schema novo vai no `create_*` original quando a tabela já existe.

## 0. Virar open-telemed (mecânico)

- Troque `adonis-web-kit` / `Adonis Web Kit` / `adonis_web_kit` por `open-telemed` /
  `Open Telemed` / `open_telemed` em código, config, env, compose, docs e testes. São cerca de 70
  ocorrências. O `pnpm-lock.yaml` só muda pelo pnpm.
- `package.json`: name `open-telemed`, version `0.1.0`, license `AGPL-3.0-only`. Tire as URLs do
  repo do kit, porque o repo novo ainda não existe no GitHub.
- `LICENSE` já é AGPL-3.0. O MIT do kit fica em `LICENSE-adonis-web-kit-MIT`. Crie um `NOTICE`
  dizendo que parte do código vem do adonis-web-kit (MIT, © Gabriel Maia).
- Padrões de produto: `REGISTRATION_WORKSPACE_MODE=none` (sem cadastro público: clínica e médico
  entram por convite ou admin) e `DEMO_PAGES_ENABLED=false`.
- O README vira pt-BR, curto, sobre o open-telemed: o que é, como rodar, a API, o fluxo e um link
  para as regras. O `README-pt.md` sai.

## 1. Infra de dev (Docker num host remoto)

O Docker de dev roda num host remoto, alcançado pela rede privada. Portas e volumes ficam lá. As
portas 5432 e 6379 desse host **já são de outro projeto**: não mexa nos containers dele.

- `docker-compose.yml`: `postgres` em **5434**, `redis` em **6381**, `mailpit` em **1026/8026** e
  `livekit` (`livekit/livekit-server:v1.13.11`, `--dev --bind 0.0.0.0 --node-ip
  ${LIVEKIT_NODE_IP}`, portas 7880, 7881 e 7882/udp). Mantenha o projeto compose `open-telemed`
  e o serviço `livekit`: o container `open-telemed-livekit-1` já roda e deve ser reaproveitado.
  O serviço `app` do kit pode ficar, ajustado.
- `.env` / `.env.example` / `.env.test`: DB e Redis apontando para o host Docker nessas portas,
  com banco de teste separado. Mais `LIVEKIT_URL=ws://<host-docker>:7880`,
  `LIVEKIT_API_KEY=devkey`, `LIVEKIT_API_SECRET=secret` e `PLATFORM_HOSTS`, todos validados em
  `start/env.ts`.

## 2. Domínio

| Conceito | Onde |
|---|---|
| Clínica | `tenants` do kit, com colunas novas de **marca** (logo_url, primary_color, accent_color, custom_hosts jsonb) e **dados legais** (legal_name, cnpj, crm_pj, crm_pj_uf, technical_director_name, technical_director_crm, technical_director_uf), mais `webhook_url` e `webhook_secret` (cifrado com `encryption`) |
| Médico | usuário do kit com vínculo ao tenant + perfil profissional (crm, crm_uf, rqe opcional) numa tabela `professionals` (tenant_id, user_id) |
| Paciente | **não tem conta**: dados na consulta (nome, documento opcional, local informado do atendimento) |
| Consulta | módulo novo `consultations` (tenant-scoped): status `scheduled → waiting → in_progress → ended \| cancelled`, outcome `completed \| referred_in_person \| patient_declined \| no_show`, scheduled/started/ended_at, professional_id, external_id do integrador, `recording_allowed` (só a escolha; não grava) |
| Termo | módulo `consents`: `consent_texts` (tenant_id, version, body, hash; **imutável**, mudar cria versão) e `consents` (consultation_id, version, text_hash, accepted_at, ip, user_agent, representante legal opcional). Já vem um texto padrão pt-BR que cobre o art. 15, a limitação do exame físico, o direito de recusa e a gravação desligada |
| Link do paciente | `patient_links`: hash do segredo, expires_at. O segredo vai no `#fragmento`, e o front troca por sessão anônima via POST |
| Vídeo | serviço em `app/shared/` (ou módulo `video`) com `livekit-server-sdk`: sala `t<tenantId>-<consultationId>`, `maxParticipants: 2`, token com grant só para essa sala, metadata só `{ role }` |
| Auditoria | o módulo `audits` do kit: consentiu, entrou na espera, admitido, entrou, saiu, encerrou, desfecho |

Permissões novas no seed do kit (`consultations.*`, `professionals.*`, `consent_texts.*`,
`tenant_branding.update`) entram nos papéis certos: o dono da clínica tudo; o médico vê e atende
as **próprias** consultas, pela checagem de ownership do kit.

## 3. Telas

- **Painel (logado, Inertia, com a marca do tenant ativo)**:
  - Consultas: lista, criar, detalhe com o link do paciente para copiar.
  - **Sala do médico**: vê se o paciente está esperando e se consentiu → "Admitir" → vídeo →
    "Encerrar" com o desfecho, incluindo "encaminhar ao presencial".
  - Configurações da clínica: marca, dados legais, termo (nova versão) e webhook.
  - Profissionais: CRM/UF.
- **Paciente (pública, anônima, white label)** `/c#<segredo>`: teste de câmera e microfone →
  termo (aceitar exige marcar; gravação é escolha separada e desligada) → espera, que avisa
  sozinha quando é admitido → vídeo. O botão "prefiro atendimento presencial" encerra com
  `patient_declined`.
  - O rodapé mostra razão social, CNPJ, CRM-PJ e diretor técnico, porque o white label não
    esconde quem responde.
  - Página pública **não** devolve dados de usuário logado.
- Tenant da página pública: pelo `Host`, conferido contra `custom_hosts` e `PLATFORM_HOSTS`. Em dev
  serve `/t/<slug>/c#…` também. **Nunca** confie em `X-Forwarded-Host` sem `TRUST_PROXY`.
- Marca: CSS variables do tenant, incluindo as `--lk-*` do LiveKit, logo e título.
- A chamada em pt-BR. Se o `VideoConference` não aceitar rótulos, monte com `GridLayout`,
  `ParticipantTile` e `ControlBar`.
- Espera em tempo real com polling curto ou SSE. Não use o LiveKit: o paciente ainda não tem token.

## 4. API do integrador (por exemplo a Clínica Fácil)

Use os **API tokens do kit** de um usuário de serviço do tenant, com permissões só de consulta.
Rotas sob `/api/v1`:
- `POST /consultations` cria e devolve o link do paciente e a URL da sala do médico no painel.
- `GET /consultations/:id` devolve o registro, com campos que mapeiam para o RAC.
- `POST /consultations/:id/cancel`.
- `GET /consultations/:id/audit`.

Documente no `docs/openapi.yaml`, que o kit já valida nos testes. Recurso de outro tenant
responde **404**.

## 5. Webhooks

- **Entrada do LiveKit** `POST /webhooks/livekit`: valide com o `WebhookReceiver`.
  `participant_joined`, `participant_left` e `room_finished` atualizam o status e o audit.
- **Saída para o integrador**: um job na Bull queue do kit, com POST JSON assinado em HMAC-SHA256
  (`X-OpenTelemed-Signature`) a cada mudança de status e retentativas com backoff.
- Em dev o LiveKit (no host remoto) não alcança esta máquina. Teste o handler com payload assinado nos
  testes.

## Fora desta etapa

Receita e atestado (ICP-Brasil), gravação, FHIR/RNDS, validação do CRM no CFM e app mobile.

## Critérios de aceite

1. `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` e `pnpm test:ui` passam. Rode as suítes de teste
   com poucos workers: a máquina tem 31 GiB e o earlyoom já matou runner descontrolado.
2. Testes Japa cobrem, no mínimo:
   - tenant A não lê, cancela nem audita consulta do tenant B (404);
   - o paciente não recebe token de vídeo antes de consentir e de ser admitido;
   - um médico não admite nem pega token de consulta que não é dele;
   - a sala tem o prefixo do tenant e o token só tem grant para ela;
   - um webhook do LiveKit com assinatura inválida é recusado;
   - um termo novo cria versão, e o consentimento antigo guarda a versão e o hash que viu;
   - host desconhecido não resolve tenant, e `X-Forwarded-Host` é ignorado sem `TRUST_PROXY`;
   - a página pública não vaza dados de quem está logado.
3. Seed de dev com 2 clínicas de marcas diferentes, cada uma com médico, usuário de serviço e uma
   consulta. Os links e logins vão impressos no console.
4. Teste no navegador com câmera falsa (`--use-fake-device-for-media-stream`): o paciente
   consente → espera → o médico admite no painel → os dois se veem; a clínica B mostra outra
   marca. Prints a 390 e 1280 px.
5. README pt-BR atualizado.
