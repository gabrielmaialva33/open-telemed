[English](clinicafacil-integration.md) · **Português**

# Integração com a Clínica Fácil

Estado: implementação e testes do open-telemed concluídos; a Clínica Fácil foi inspecionada somente para leitura. As mudanças propostas para a Clínica Fácil e o SSO abaixo não foram implementados. Consulte [OpenAPI](openapi.yaml), [relatório de revisão](review-report.pt.md) e [requisitos clínicos](brazil-telemedicine-rules.pt.md).

## Identidade e limite de tenant

Uma empresa da Clínica Fácil corresponde a uma clínica do open-telemed. Use **um usuário de serviço e token opaco exclusivos por clínica**, com exatamente um vínculo ativo. Isso limita o impacto de uma credencial vazada e torna explícitas a atribuição e a rotação. Um integrador compartilhado de toda a plataforma aumentaria esse impacto e não é a implantação proposta.

Envie `Authorization: Bearer <service-token>` e o `X-Tenant-Id` mapeado. Vínculo, tenant ativo, RBAC e abilities do token são verificados. O vínculo único é requisito de provisionamento, não uma nova restrição de tenant embutida no token: não adicione outros vínculos ao usuário. JWTs de login não autenticam a API de integração.

Conceda somente `consultations.create`, `consultations.read`, `consultations.update`, `consultations.link`, `consultations.cancel`, `consultations.audit` e `professionals.read`. O integrador não tem privilégio de atendimento. Guarde tokens e segredos de webhook cifrados no servidor; nunca os exponha ao navegador, assistente ou logs. Em instalações existentes do open-telemed, execute `pnpm ace permission:sync`; tokens existentes precisam de reemissão explícita para receber novas abilities. Não rode seeders novamente para provisionar.

## Contrato HTTP

Todos os caminhos abaixo começam com `/api/v1`; corpos e respostas JSON. O OpenAPI contém os schemas completos.

| Método e caminho                          | Ability                | Resultado de sucesso e restrições                                                                                                                                   |
| ----------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /consultations`                     | `consultations.create` | 201 `{created:true, consultation, patient_url, doctor_url}` na criação; 200 `{created:false, consultation, patient_url:null, doctor_url}` na repetição idempotente. |
| `GET /consultations/:id`                  | `consultations.read`   | 200 `{data}` com profissional, versão/hash do consentimento, horários e data de retenção.                                                                           |
| `PATCH /consultations/:id`                | `consultations.update` | 200 `{data}`; altera `scheduled_at` e/ou `professional_id` apenas enquanto `scheduled`.                                                                             |
| `POST /consultations/:id/patient-link`    | `consultations.link`   | 200 `{patient_url}`; revoga explicitamente links e sessões de paciente anteriores. Consultas terminais retornam 409.                                                |
| `POST /consultations/:id/cancel`          | `consultations.cancel` | 200 `{data}` para agendadas/em espera; em andamento ou terminais retornam 409.                                                                                      |
| `GET /consultations/:id/audit`            | `consultations.audit`  | 200 `{data:[...]}`; eventos de auditoria append-only.                                                                                                               |
| `GET /professionals?crm=123456&crm_uf=SP` | `professionals.read`   | 200 `{data:[...]}` com id/nome/CRM/UF/RQE; filtros opcionais, restritos à clínica selecionada; sem correspondência retorna lista vazia.                             |

Exemplo de criação (valores sintéticos):

```json
{
  "external_id": "appointment:1234",
  "professional_id": 42,
  "patient_name": "Paciente Exemplo",
  "patient_location": "São Paulo/SP",
  "scheduled_at": "2026-12-10T14:00:00-03:00"
}
```

`patient_document` é opcional. Use o paciente real, não automaticamente o contato do WhatsApp ou cliente pagante. A localização do paciente precisa ser informada explicitamente. Horários exigem offset ISO 8601 ou `Z` e data válida.

`external_id` é único **dentro da clínica**. Repetições concorrentes são serializadas e criam uma consulta, link inicial e evento de agendamento. A repetição ainda exige corpo de criação válido; diferenças são ignoradas, não aplicadas. Sem `external_id`, cada POST cria outra consulta. Se a primeira resposta se perder, GET/POST repetido não recuperam o segredo: emita explicitamente um novo link. Persista o vínculo agendamento-consulta antes do envio.

Respostas de criação e link usam `Cache-Control: no-store`. O segredo do link fica no fragmento da URL. Trate a URL completa como credencial, inclusive no armazenamento do WhatsApp e nos rastros de erro. A expiração inicial é o maior entre horário agendado + 1 dia e emissão + 3 horas. PATCH preserva o link e nunca renova sua expiração; reemita explicitamente quando necessário. A reemissão revoga cookies/links, **não JWTs LiveKit já emitidos**. Não reemita automaticamente durante uma chamada.

Erros: 401 autenticação inválida/ausente/expirada; 403 falta de vínculo/permissão/ability; 404 recurso inexistente ou alheio; 409 estado incompatível; 422 entrada inválida; 429 limite (100 requisições/minuto por usuário de serviço). Preserve erros estruturados, evite registrar dados do paciente e repita falhas de transporte/5xx/429 com backoff limitado; resolva 4xx semanticamente. Cancelamento/encerramento são transições de estado, não respostas idempotentes de sucesso: concilie por GET após entrega incerta.

## Webhook de saída assinado

Configure URL e segredo cifrado na clínica do open-telemed. A origem precisa ser aprovada pelo operador em `WEBHOOK_ALLOWED_ORIGINS`; lista vazia bloqueia envios. Produção exige HTTPS, sem credenciais ou fragmentos na URL, e rejeita redirects. A origem aprovada e seu DNS são confiados; é uma allowlist do operador, não fixação de DNS. Alterar a URL da clínica não reescreve entregas já enfileiradas.

```json
{
  "event_id": "b4ac396e-c9a8-47b4-bf18-83f8d50a1d9a",
  "id": "b4ac396e-c9a8-47b4-bf18-83f8d50a1d9a",
  "event": "consultation.status_changed",
  "occurred_at": "2026-12-10T17:30:00.000Z",
  "tenant_id": 7,
  "consultation": {
    "id": 81,
    "external_id": "appointment:1234",
    "status": "ended",
    "outcome": "completed",
    "modality": "teleconsulta",
    "professional": { "id": 42, "crm": "123456", "crm_uf": "SP" },
    "scheduled_at": "2026-12-10T17:00:00.000Z",
    "admitted_at": "2026-12-10T17:02:00.000Z",
    "started_at": "2026-12-10T17:02:00.000Z",
    "ended_at": "2026-12-10T17:30:00.000Z"
  }
}
```

`id` é alias legado de `event_id`. Alterações emitem `consultation.updated`; transições emitem `consultation.status_changed`. Estados: `scheduled`, `waiting`, `in_progress`, `ended`, `cancelled`. Desfechos: `completed`, `referred_in_person`, `patient_declined`, `no_show`, ou null. Nome/documento do paciente não são incluídos. Horários de entrada/saída e consentimento ficam no GET autenticado, não neste evento.

Headers: `X-OpenTelemed-Timestamp: <Unix segundos>` e `X-OpenTelemed-Signature: sha256=<64 dígitos hex>`. Calcule HMAC-SHA256 de **timestamp + `.` + corpo UTF-8 bruto exato** com o segredo compartilhado; nunca reserialize JSON antes da verificação. Esse formato com timestamp substitui a assinatura somente do corpo.

O receptor deve rejeitar timestamp/assinatura malformados, exigir diferença absoluta de relógio ≤300 segundos, decodificar e comparar digests de mesmo tamanho com `timingSafeEqual`, e verificar clínica + consulta + external_id mapeados. Use chave única `(connection_id, event_id)` de inbox e confirme deduplicação com efeitos/outbox locais na mesma transação. Retorne 2xx somente após persistência durável. A janela de timestamp sozinha não impede replay dentro dela. Eventos duplicados devem retornar sucesso sem repetir efeitos.

Retentativas preservam corpo/event_id, renovam timestamp/assinatura e podem chegar fora de ordem. Consulte o estado atual por GET antes de conciliar transições; não sobrescreva cegamente um estado mais novo. Política da fila: seis tentativas, backoff exponencial inicial de 1 segundo, timeout HTTP de 10 segundos. Monitore jobs esgotados. `pnpm ace telemed:dispatch-webhooks` recupera enfileiramentos pendentes; jobs esgotados exigem operação. Drene entregas pendentes antes de trocar segredos, pois cada linha da outbox guarda uma cópia cifrada do segredo. Dispatch/conciliação periódicos precisam ser operados explicitamente.

## Fluxo completo e mudanças na Clínica Fácil

Os caminhos desta seção são relativos ao repositório da Clínica Fácil, consultado somente para leitura.

1. O fluxo atual confirma o agendamento por `app/modules/agenda/services/book_appointment_service.ts`. Na mesma transação local, persista a intenção de criação telemed; chame open-telemed assincronamente após commit. Não substitua as validações de capacidade/idempotência/locks da agenda pela chamada remota.
2. Resolva um mapeamento profissional verificado, envie POST com `external_id=appointment:<id>`, persista id/estado remoto e entregue o link com segurança. Repita criação de forma idempotente; reemissão explícita é ação separada quando o segredo se perde ou expira.
3. Envie por `app/modules/whatsapp/services/send_message_service.ts` com `client_request_id` estável para aquela intenção de envio. Respeite dono da conversa, atribuição, transação da mensagem pendente e enqueue após commit. Fora da janela de 24 horas, use template aprovado; template não reabre a janela. Não invente lead/conversa para um agendamento de painel.
4. O paciente abre a página da clínica, consente com versão/hash atuais e entra na espera. O link é trocado por cookie HttpOnly identificado pela consulta; abas permanecem independentes. Sem vídeo antes de consentimento e admissão.
5. O médico responsável abre `doctor_url` com sessão/login existente do open-telemed e admite explicitamente. Nem agendador nem gestor ganham direito de atendimento pela integração.
6. Receba o evento assinado numa inbox, concilie o registro remoto e armazene desfecho/horários operacionais. Aplique transições da agenda apenas pelo serviço existente e com mapeamento aprovado pelo dono. Não crie nem assine notas clínicas automaticamente.

| Mudança proposta na Clínica Fácil                                                                                                            | Responsabilidade                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Novo `app/modules/telemed/` com controllers, validators, services, repositories, models, jobs e `routes.ts`                                  | Configuração, mapeamentos verificados, comandos de criação/alteração/cancelamento/link, inbox e conciliação; chamadas remotas isoladas em cliente.                                                                                          |
| `app/modules/features/feature_catalog.ts`, `inertia/lib/feature_keys.ts`                                                                     | Adicionar `telemed`, inicialmente desabilitada, sem medição, dependente de `agenda`; cobrança permanece decisão do dono.                                                                                                                    |
| `app/modules/features/support/module_permissions.ts`, `app/modules/team/support/team_permissions.ts`                                         | Capacidades explícitas de configurar/agendar/ler/link, conectadas à aplicação de features e equipe. Gate pela empresa proprietária nos serviços, incluindo jobs/webhooks; desabilitar não apaga registros.                                  |
| Serviços de agendamento/status/fila e interface da agenda                                                                                    | Ações telemed e estado remoto sem contornar o writer, a máquina de estados ou a autorização de atendimento existentes.                                                                                                                      |
| Serviço de envio WhatsApp e configuração de template aprovado                                                                                | Envio controlado pelo servidor; considerar contato versus paciente e regras de aprovação/janela.                                                                                                                                            |
| Novas migrations de `telemed_connections`, `telemed_professional_links`, `telemed_consultations`, `telemed_webhook_events`, `telemed_outbox` | Credenciais cifradas e vínculo 1:1 de clínica; mapeamento profissional por empresa; unicidade empresa/agendamento e consulta remota; inbox única conexão/evento; intenções duráveis de retry. Nenhuma alteração de schema foi executada lá. |

## Invariantes herdadas da Clínica Fácil

- **Agenda** (`.claude/rules/agenda.md`, `agenda-assistente.md`, `agenda-assistente-paciente.md`): `appointments.attendee` identifica o paciente; `customer_id` pode ser outra pessoa. Preserve origem, produto, profissional, lead e empresa proprietária. O assistente só prepara propostas; confirmação explícita agenda. Guardas existentes do espelho Quark e checkout continuam mandando.
- **Remarcação** (`agenda.md` e `BookAppointmentService.rescheduleOfId`): cria **novo** agendamento e marca o anterior como `rescheduled`. Cancele a consulta remota antiga e crie outra com novo external_id; não a reutilize por PATCH. PATCH atende correções reais no mesmo registro enquanto agendado. Se a consulta antiga estiver em andamento, pare a automação e exija o fluxo do médico responsável; o integrador não pode encerrá-la.
- **Profissionais** (`agenda-equipe.md`, `agenda/models/professional.ts`): `user_id` opcional, conselho/registro em texto livre e `profile_id` compartilhado entre unidades não são identidade CRM/UF verificada. Cadastre médicos pelo painel existente do open-telemed, verifique CRM/UF e persista ids explícitos por empresa. Nunca corresponda por nome nem interprete texto livre automaticamente como credencial. Provisionamento de contas via API fica adiado junto das decisões de auth.
- **Atendimento** (`agenda-atendimento.md`, `agenda/support/appointment_status.ts`): estados da agenda (`scheduled`, `confirmed`, `arrived`, `in_service`, `done`, `no_show`, `cancelled`, `rescheduled`) não são idênticos aos estados telemed. Desconexão de vídeo não significa automaticamente consulta concluída. Concilie pelo serviço existente após o dono definir mapeamentos.
- **WhatsApp/assistente** (`whatsapp.md`, `whatsapp-envio.md`, `whatsapp-assistente*.md`): preserve janela de 24 horas, atribuição, idempotência, handoff humano e guardas de saúde/urgência. O link é saída controlada do servidor, não URL gerada pelo assistente nem motivo para liberar amplamente links externos.
- **Features/tenancy/RBAC** (`features.md`, `tenancy.md`, `rbac.md`): modo agregado root não é contexto de empresa; resolva o proprietário antes das operações. Aplique entitlements e capacidades no backend mesmo com ações ocultas na interface; sem impersonação clínica por root ou gestor.
- **Prontuário** (`app/modules/patient_records/services/patient_notes_service.ts`): notas usam `PATIENT_RECORDS_KEY`, são imutáveis e restritas ao autor atendente, com root negado. Guarde desfechos da integração operacionalmente; não contorne o serviço nem transforme webhook em nota de autoria médica. Exportação futura ao prontuário exige desenho separado com controle de acesso.

## Entrada do médico sem outro login — somente proposta

Opção atual: sessão/login existente do open-telemed e `doctor_url`. Proposta futura: ticket de entrada assinado, de uso único, solicitado servidor a servidor, com expiração de 30–60 segundos, vinculado a emissor/audiência, clínica, consulta e identidade médica verificada. Persista hash do nonce e consuma atomicamente. Revalide vínculo ativo, profissional responsável exato e permissão de atendimento no resgate; nunca aceite user id arbitrário nem impersonação por gestor. Estabeleça sessão restrita com proteção contra fixation/CSRF; mantenha ticket fora de logs, referrers e analytics.

Riscos: roubo/replay de links, impersonação pelo usuário de serviço, mapeamentos desatualizados, confusão entre tenants, sessão/cookies e revogação. Prefira troca autenticada médico-servidor, com confirmação adicional quando necessária, a link bearer transferível. Broker OIDC é alternativa com mais infraestrutura e ciclo de identidade centralizado mais claro. Nenhum desenho foi implementado; exigem aprovação do dono e análise de ameaças separada.

## Perguntas ao dono

1. Aprovar provisionamento de contas de serviço, mapeamento CRM/UF verificado, validade/rotação de tokens e origens de webhook; escolher abordagem futura de identidade/SSO.
2. Definir mapeamentos da agenda para conclusão, encaminhamento, recusa, ausência, cancelamento e interrupção, além da compensação quando o cancelamento remoto falhar na remarcação.
3. Definir entrega ao contato versus paciente/representante, template WhatsApp aprovado, coleta de consentimento/localização e escopo Quark/checkout pago.
4. Aprovar entitlement/cobrança e papéis de configurar, agendar, reemitir e ler registros; decidir operação durável do receptor/conciliação.
5. Decidir exportação clínica, snapshots da identidade médica, retenção/responsabilidades legais e requisitos de revogação rigorosa de vídeo/retry de fechamento. Apagar a sala LiveKit sozinho não garante revogação de tokens em cache; consulte o relatório de revisão.
