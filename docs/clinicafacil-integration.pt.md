[English](clinicafacil-integration.md) · **Português**

# Integração headless da Clínica Fácil

Implementada no motor; as mudanças na Clínica Fácil abaixo são o próximo ticket de implementação. Seu repositório permaneceu somente leitura. Este documento substitui a proposta anterior de segundo login. Consulte [OpenAPI](openapi.yaml), [relatório headless](headless-report.pt.md) e [requisitos clínicos](brazil-telemedicine-rules.pt.md).

## Arquitetura escolhida e alternativas

**A Clínica Fácil renderiza os fluxos do paciente e do médico no próprio domínio, com um backend intermediário (BFF).** Todas as chamadas ao motor partem desse backend. O médico permanece na agenda autenticada; o paciente usa link secreto, sem conta. A Clínica Fácil usa `@livekit/components-react` nos próprios layouts com tokens de sala obtidos pelo BFF. Ela controla títulos, textos, identificação legal da clínica, espera/erros e suporte: sem login, logo, atribuição ou navegação do motor. O painel do motor é operacional. Troca pública de link e atendimento pelo painel são recusados para clínicas headless configuradas.

Descartados: iframe/página do motor em custom host duplicam interface e fronteira de sessão; login compartilhado no navegador/JWT duradouro de impersonação ampliam privilégios. `custom_hosts` permanece para implantações não headless, mas não é a integração da Clínica Fácil. Endereços de mídia podem continuar visíveis nas ferramentas de desenvolvimento; não se afirma que WebRTC oculta destinos de rede. Navegação e links do produto permanecem na Clínica Fácil.

**Autorização médica:** asserções assinadas por ação, não uma sessão de login no motor. Mantenha credencial opaca de serviço e par de chaves exclusivos por empresa/clínica; chave privada e token nunca entram no navegador. O operador fixa emissor, chave pública RSA, usuário de serviço, URL do paciente e mapeamento explícito sujeito externo → profissional. Separe contas de serviço e clínicas. O vínculo do serviço deve ser exclusivo da clínica na configuração.

## Provisionamento e contrato de confiança

Comandos operacionais no motor (somente valores ilustrativos):

```sh
pnpm ace permission:sync
pnpm ace telemed:configure-headless --tenant-id=7 --service-user-id=20 --issuer=clinicafacil-unit-7 --public-key-file=clinic-public.pem --patient-url=https://clinic.example/teleconsulta
pnpm ace telemed:map-doctor --tenant-id=7 --professional-id=42 --subject=doctor-314
```

Cadastre médicos com nome/CRM/UF/RQE verificados pelo painel operacional. O mapeamento exige membro ativo da clínica com papel `doctor`; root global e contas de serviço não podem ser mapeados. Na Clínica Fácil, `professionals.user_id` é opcional e conselho/registro são texto livre: não deduza identidade por nome nem interprete automaticamente credenciais sem verificação. Mapeie explicitamente a conta autenticada e o profissional local. Troca de emissor com mapeamentos existentes é recusada; remova/revalide os vínculos antes. Rotação de chave no mesmo emissor preserva os vínculos e invalida imediatamente asserções da chave anterior.

Papel/token de serviço exclusivo precisam das abilities existentes de criar/ler/alterar/link/cancelar/auditar e ler profissionais, além de `consultations.headless_patient` e `consultations.headless_doctor`. Cada rota verifica RBAC, ability, vínculo do tenant e usuário configurado. Tokens antigos precisam de reemissão explícita para novas abilities. Não é necessário executar seed novamente.

A Clínica Fácil deve verificar login ativo, módulo contratado, vínculo da empresa, profissional responsável exato, capacidade médica e agendamento atual em **toda** requisição médica antes de assinar. Dono/gestor não pode escolher o subject de um médico. Backend signatário comprometido pode impersonar seus médicos mapeados; proteja e audite essa fronteira explícita de confiança federada.

## API do médico — servidor a servidor

Todas as requisições usam `Authorization: Bearer <service-token>` e `X-Tenant-Id` mapeado. Envie POST JSON `{ "assertion": "<JWT assinado>" }` a `/api/v1/headless/doctor/:id/{state,admit,video-token,end}`.

Exemplo de payload assinado; identificadores sintéticos:

```json
{
  "iss": "clinicafacil-unit-7",
  "aud": "telemed:doctor-action",
  "sub": "doctor-314",
  "jti": "cc0e4a41-a276-445c-8698-afb043bb1ac0",
  "iat": 1807000000,
  "exp": 1807000060,
  "consultation_id": 81,
  "action": "end",
  "outcome": "completed"
}
```

Assine com **RS256**, RSA ≥2048 bits. `exp-iat` deve ser positivo e ≤60 segundos; falham asserção expirada, `iat` antigo ou mais de cinco segundos no futuro, emissor/audiência/algoritmo/chave errados, sujeito não mapeado e ação/consulta incompatíveis. `jti` é UUID, consumido atomicamente com cada ação bem-sucedida; retry após sucesso incerto usa nova asserção e concilia estado. `outcome` é assinado e obrigatório em `end`, não vem de campo não assinado do corpo. Nenhuma URL de chave fornecida pelo chamador é consultada.

O motor revalida conexão, vínculo do médico, profissional responsável, papel direto `doctor` e grant de atendimento sob lock da consulta. Root e gestores sem essa identidade clínica são recusados. Não concede `attend` genérico ao integrador. Auditoria diferencia médico do usuário/conexão de serviço que transportou a requisição.

| Ação          | Resultado                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`       | 200 `{data: ConsultationRecord}` a partir do registro autorizado sob lock.                                                                                                                        |
| `admit`       | 200 `{data}`; exige espera e consentimento, inicia atendimento e congela identidade médica.                                                                                                       |
| `video-token` | 200 `{token,url}`; exige consentimento/admissão/em andamento, metadata só de papel, dois participantes, TTL inicial de 60 segundos.                                                               |
| `end`         | 200 `{data}`; desfecho assinado `completed`, `referred_in_person` ou `no_show`; registra autoria imutável e agenda fechamento de vídeo. Conclusão/encaminhamento exigem atendimento em andamento. |

Erros: 400 contexto/header de tenant inválido; 401 credenciais/asserção inválidas, expiradas ou repetidas; 403 falta de ability/vínculo ou identidade/escopo clínico incorretos; 404 recurso inexistente/alheio; 409 estado incompatível; 422 payload inválido; 429 limite. Repita transporte/5xx/429 com backoff limitado; concilie estado após mutação incerta, sem tratar repetição de transição como sucesso.

Sem cookie de sessão do motor nem segundo login. O BFF repassa somente resultado autorizado à interface, nunca asserção/token de serviço. Todas as respostas headless são `no-store, private` com `no-referrer`. Autentique as rotas do BFF para o navegador e aplique CSRF nelas.

## API do paciente — servidor a servidor

Todos os endpoints abaixo são POST sob `/api/v1/headless/patient`, com as mesmas credenciais de serviço/tenant e ability do paciente. O navegador nunca recebe a credencial de serviço.

| Endpoint       | Entrada e resultado                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/session`     | `{secret}` do fragmento do link → estado do paciente e `session_secret`; não define cookie de paciente do motor.                                               |
| `/state`       | `?consultation_id=81` e `X-Patient-Session` → marca da clínica, primeiro nome, estado, consentimento/admissão e versão/hash/corpo do termo exibido.            |
| `/consent`     | Mesmo contexto mais `{accepted:true,version,text_hash,recording_allowed?,representative_name?,representative_document?,client_ip,client_user_agent}` → espera. |
| `/video-token` | Mesmo contexto → `{token,url}` somente após consentimento e admissão.                                                                                          |
| `/decline`     | Mesmo contexto → `ended/patient_declined`, atribuído ao paciente, com fechamento de vídeo agendado.                                                            |

Na página da Clínica Fácil, capture o fragmento uma vez, remova-o da barra e troque pelo BFF. Guarde a sessão do motor com segurança no servidor, indexada por cookie HttpOnly/Secure/SameSite independente por consulta; remova `session_secret` do JSON ao navegador. Preserve o seletor não secreto da consulta em reloads/abas. Envie IP/user agent verificados da requisição como evidência, não headers forwarded arbitrários do navegador. O BFF deve limitar troca pública de segredo e sessões por IP/sessão; o motor também limita API a 100 requisições/minuto por usuário de serviço. Dimensione polling para esse orçamento compartilhado; recue em 429 e use cache backend de estado operacional não secreto quando apropriado.

Versão/hash e aceite explícito não mudam. Dados do representante precisam vir em par. Link/cookie roubado permite o fluxo limitado daquele paciente; proteja URLs de logs, analytics, referrers e previews. Reemissão revoga links/sessões anteriores, mas não é revogação de token de vídeo e não deve ocorrer automaticamente durante a chamada.

## Contrato de agendamento e exportação

Permanecem os endpoints `/api/v1`: POST `/consultations`, GET/PATCH `/consultations/:id`, POST `/:id/patient-link`, POST `/:id/cancel`, GET `/:id/audit`, GET `/professionals?crm=...&crm_uf=...`. Schemas completos no OpenAPI. Criação exige `professional_id`, `patient_name` real, `patient_location`, `scheduled_at` com offset; `patient_document` e `external_id` são opcionais. Use `external_id=appointment:<id>`.

Criação retorna 201 `{created:true,consultation,patient_url,doctor_url:null}` para clínicas headless configuradas. `patient_url` usa somente URL do frontend Clínica Fácil configurado mais fragmento secreto. Retry válido com mesma clínica/external_id retorna 200/registro atual, `created:false`, `patient_url:null`; diferenças são ignoradas e não geram link/evento. Sem external_id, cada chamada cria outra consulta. Perda do primeiro segredo exige emissão explícita. PATCH altera só horário/profissional enquanto agendada; não renova o link. Expiração é o maior entre horário + 1 dia e emissão + 3 horas. Cancelamento só antes de em andamento; ações terminais/incompatíveis retornam 409.

GET exporta `record_schema_version:1`, `revision`, `professional_snapshot` e `outcome_author`, além de consulta/consentimento/horários/retenção. Snapshot: `professional_id,user_id,name,crm,crm_uf,rqe,captured_at,capture_reason`. Capturado na admissão ou na decisão médica explícita de `no_show` se nunca admitida. Edições cadastrais posteriores não o reescrevem. PostgreSQL rejeita alteração/remoção do snapshot capturado ou autoria finalizada.

`outcome_author` contém `kind`, `user_id`, `external_subject`, `consultation_id`, `attributed_at` e profissional congelado nas decisões médicas. Recusa tem kind `patient`; cancelamento administrativo tem kind `system`, nunca médico inventado. São resumo de encontro atribuído e desfecho operacional, **não** receita assinada, narrativa clínica ou assinatura ICP-Brasil. Histórico sem snapshot capturado permanece explicitamente null; não invente autoria retrospectiva. `video_closure` no GET informa separadamente pending/completed, modo, tentativas e `tokens_revoked`; conclusão clínica não comprova revogação de mídia. Progresso do fechamento pode mudar sem alterar a revisão clínica e deve continuar sendo atualizado após o encerramento.

## Conciliação com a agenda — política recomendada

Use **outbox/inbox duráveis, mantendo estados local e remoto separados**, não gravação dupla síncrona nem SQL direto de status. `BookAppointmentService` permanece dono do agendamento nativo; publique intenção remota na mesma transação local e repita com external_id. Preserve origem, paciente, lead, produto, profissional, capacidade e checkout. Webhooks fora de ordem nunca sobrescrevem a agenda diretamente.

| Evidência telemed                           | Efeito recomendado na Clínica Fácil                                                                                                                                                                                                                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scheduled`                                 | Persistir mapeamento remoto e convite pendente/enviado; não confirmar/marcar chegada automaticamente.                                                                                                                                                          |
| `waiting` após consentimento                | Registrar espera remota; no dia, transicionar scheduled/confirmed elegíveis a arrived pelo `AppointmentStatusService`, uma vez e respeitando guardas. Conflitos viram exceção operacional.                                                                     |
| Médico escolhe Admitir                      | Fluxo médico autenticado reserva intenção local e usa verificações existentes de fila/status para iniciar, depois delega admissão remota; repete/concilia resposta incerta. Mostrar sincronização pendente; nunca iniciar segundo atendimento do profissional. |
| `in_progress`                               | Confirmar intenção de admissão; webhook não impersona médico nem contorna regra de atendimento único.                                                                                                                                                          |
| Médico `completed` / `referred_in_person`   | Importar resumo com autoria, depois transicionar atendimento nativo ativo correspondente para done pelos serviços existentes; encaminhamento fica como detalhe clínico/operacional separado.                                                                   |
| `patient_declined`, `no_show`, cancelamento | Registrar evidência remota; não liberar vaga, estornar checkout ou marcar falta sem verificações nativas de horário/checkout/ator. Em conflito, enfileirar ação permitida ao operador.                                                                         |
| `consultation.interrupted`                  | Mostrar interrupção/reconexão e manter in-progress. Fim da sala sozinho não é conclusão nem ausência.                                                                                                                                                          |

Remarcação cria **novo** agendamento (`rescheduleOfId`) e marca antigo remarcado. Cancele consulta remota antiga e crie novo external_id; preserve intenção compensatória se o cancelamento falhar. Não reutilize silenciosamente a consulta por PATCH. Chamadas em andamento exigem médico responsável, não cancelamento pelo integrador. Em falha definitiva da admissão remota, desfaça o início local somente pelo fluxo autorizado existente e sem nota clínica ou outro efeito irreversível; caso contrário exija conciliação explícita. Inicialmente exclua espelhos Quark ativos da automação telemed; seu fluxo de propriedade/status precisa ser integrado separadamente. Não contorne checkout, registro de venda ou efeitos financeiros.

Para exportação, crie artefato de encontro importado cifrado, ligado a agendamento/paciente e autor remoto congelado, único por consulta/revisão de schema remota. Separe identidade de transporte. Não insira pelo `PatientNotesService` como se usuário de serviço fosse autor: guardas de autor atendente, negação a root e imutabilidade continuam. Médico pode adotar/referenciar explicitamente o artefato numa nota própria enquanto autorizado; histórico administrativo segue acesso ao prontuário. Importação e confirmação da inbox compartilham transação.

## Recomendação de destinatário e WhatsApp

Exija **confirmação explícita de destinatário no agendamento**: o próprio paciente por padrão; representante identificado e autorizado quando necessário. `appointments.attendee` é paciente, mas `customer_id`/lead WhatsApp pode ser pagante ou terceiro; nunca iguale silenciosamente. Guarde tipo de destinatário, canal validado, vínculo com agendamento e confirmação da equipe/paciente. Sem destinatário/conversa verificados, ofereça ação controlada de copiar/enviar e estado operacional de entrega pendente; não invente lead.

Use `SendMessageService`, preservando atribuição e enqueue transacional. Deduplicate por `client_request_id` estável de cada intenção; reemissão deliberada é nova intenção. Na janela ativa de 24 horas, envie mensagem transacional neutra. Fora dela, use **template utility aprovado** pelo provedor com data/hora, identidade da clínica e botão de acesso, sem diagnóstico, CPF ou especialidade desnecessária. Texto sugerido: “Sua consulta está agendada para {{date}} às {{time}}. Acesse com segurança pelo botão. Se precisar de ajuda, fale com a clínica.” Obtenha aprovação e verifique que o botão preserva o fragmento secreto antes de liberar; desative previews e use outro canal aprovado se a configuração do provedor não preservar o link. Nunca enfraqueça consentimento para caber no template.

Descartados: envio incondicional ao lead atual, links gerados autonomamente pelo assistente e texto livre fora da janela. Assistente pode preparar proposta; confirmação explícita, handoff de saúde/urgência e guardas de links externos permanecem. URLs telemed são saída controlada do servidor, não exceção ampla na allowlist de links.

## Webhooks e fechamento de vídeo

Eventos contêm `event_id` estável (`id` é alias legado), event/occurred_at/tenant_id e id/external_id/status/outcome/horários/CRM/UF da consulta. Incluem agora `revision` monotônica, versão de schema e resumo de autoria; CRM/UF usa snapshot quando disponível. Eventos: `consultation.status_changed`, `consultation.updated`, `consultation.interrupted`. GET fornece registro completo atribuído; eventos omitem nome/documento do paciente.

Valide `X-OpenTelemed-Signature: sha256=<hex>` com HMAC-SHA256 de `X-OpenTelemed-Timestamp + '.' + corpo UTF-8 bruto exato`; confira timestamp em ±300 segundos, comparação de digests de mesmo tamanho em tempo constante, tenant/consulta/external_id mapeados e unicidade durável `(connection,event_id)`. Confirme 2xx após aceitação transacional na inbox. Busque/concilie revisão atual sem regredi-la; duplicados/antigos não repetem efeitos. Timestamp sozinho não impede replay. Seis tentativas, backoff exponencial de 1 segundo, timeout de 10 segundos, sem redirects; exige allowlist operacional `WEBHOOK_ALLOWED_ORIGINS` e HTTPS em produção. Drene pendências antes de trocar o segredo copiado por entrega. Mantenha worker consumindo `consultation-webhooks`, execute `pnpm ace telemed:dispatch-webhooks` para dispatch pendente e opere recuperação de jobs esgotados.

Recomendo **LiveKit Cloud com cutoff explícito de revogação**, somado ao fechamento durável implementado. Remove ambas as identidades determinísticas antes de excluir a sala; falhas ficam pendentes para retry. Exclusão self-hosted não revoga tokens em cache. A distinção segue o [contrato de tokens LiveKit](https://docs.livekit.io/frontends/reference/tokens-grants/); implantação Cloud real ainda exige qualificação e relógios sincronizados. Não afirme revogação rigorosa no modo `self_hosted`. `tokens_revoked` da outbox distingue confirmação do provedor de mera exclusão de sala. Execute `pnpm ace telemed:close-videos` a cada minuto com monitoramento e `pnpm ace telemed:prune-assertions` periodicamente. Disconnect no cliente ou TTL inicial curto não são prova de revogação.

## Ticket de implementação da Clínica Fácil

- Criar `app/modules/telemed/` com fronteiras controller → service → repository → model, cliente, signatário, BFF do paciente, inbox de webhook, jobs de outbox/conciliação e `routes.ts`. Páginas React médico/paciente e props em `app/types/inertia.ts`, navegação nativa e componentes LiveKit.
- Ampliar `app/modules/features/feature_catalog.ts` e `inertia/lib/feature_keys.ts` com `telemed` inicialmente desligada, dependente de `agenda`; conectar `features/support/module_permissions.ts` e `team/support/team_permissions.ts`. Aplicar entitlement da empresa nos serviços/jobs e rotas. Cobrança é explícita, não deduzida de evento de vídeo.
- Integrar `agenda/services/book_appointment_service.ts`, `appointment_status_service.ts`, `queue_call_service.ts` e interface sem substituir locks/guardas. Integrar `whatsapp/services/send_message_service.ts` e template aprovado; preservar propriedade/janela/idempotência.
- Migrations de conexões/chaves privadas cifradas, mapeamentos profissionais verificados, consultas/revisão/estado de sincronização, confirmação de destinatário/intenção de envio, inbox única, outbox durável e artefatos de encontro importado cifrados. Reutilizar acesso ao prontuário; não enfraquecer notas imutáveis de autoria médica.
- Aceite precisa cobrir ausência de segundo login/marca do motor, distinção paciente/representante, replay/adulteração/médico alheio, retry após timeout, revisões fora de ordem, recusa Quark/checkout, template e revogação terminal de vídeo verificada. Nenhum schema/runtime da Clínica Fácil foi alterado nesta tarefa.

Invariantes consultadas: `.claude/rules/agenda.md`, `agenda-atendimento.md`, `agenda-equipe.md`, `agenda-assistente*.md`, `whatsapp.md`, `whatsapp-envio.md`, `whatsapp-assistente*.md`, `features.md`, `tenancy.md`, `rbac.md`; implementações de agenda, WhatsApp, equipe, features e `patient_records/services/patient_notes_service.ts` fundamentam as recomendações.
