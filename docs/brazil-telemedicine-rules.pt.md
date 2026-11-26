[English](brazil-telemedicine-rules.md) · **Português**

# Regras de telemedicina no Brasil — o que vira requisito de produto

Pesquisa de 2026-11-25. Cada linha cita a norma; "→" é o que o open-telemed precisa fazer.
Isto não é parecer jurídico: antes de produção, um advogado de saúde confere.

## Normas que valem

| Norma | Situação em 2026-11 | Fonte |
|---|---|---|
| Lei 14.510/2022 (telessaúde, altera a Lei 8.080) | em vigor | planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14510.htm |
| Resolução CFM 2.314/2022 (telemedicina) | em vigor | sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf |
| Resolução CFM 2.299/2021 (documentos médicos eletrônicos) | em vigor | sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2021/2299_2021.pdf |
| Resolução CFM 2.381/2024 (conteúdo mínimo de documento médico) | em vigor | via jb.com.br, 2026-11-07 |
| Resolução CFM 2.382/2024 (Atesta CFM obrigatório) | **suspensa por liminar** (proc. 1087770-91.2024.4.01.3400); CFM confirmou em 2026-10-02 | sistemas.cfm.org.br/.../2382_2024.pdf |
| Lei 14.063/2020 art. 13 + ANVISA RDC 1.000/2025 (receita digital) | em vigor | gov.br/anvisa (Perguntas e respostas RDC 1000/2025) |
| Lei 13.787/2018 (prontuário eletrônico) | em vigor: guarda mínima de 20 anos | — |
| LGPD (Lei 13.709/2018), dado de saúde é dado sensível (art. 11) | em vigor | — |
| RNDS: RAC (Portaria GM/MS 8.347/2025), teleconsulta = RAC + "Modalidade de Telessaúde" | RAC publicado; o modelo de teleconsulta aguardava portaria | fhir.saude.gov.br/rac/ · hl7.org.br/fhir/core |

## Requisitos

### Consentimento (CFM 2.314 art. 15 e parágrafo único; Lei 14.510 art. 26-A II, 26-G I)
- O paciente ou o representante legal autoriza **o teleatendimento e a transmissão de imagens e
  dados**, por meio eletrônico ou pela gravação da leitura do texto. O registro faz parte do
  prontuário.
- O consentimento é **explícito**: o paciente sabe que os dados podem ser compartilhados e que pode
  negar, salvo em emergência.
- → Termo versionado por tenant. Gravamos o aceite com versão do texto, hash do texto, data e hora,
  IP, user-agent e, quando houver, nome e documento do representante legal. O token de vídeo só sai
  depois do aceite.

### Limitações e direito de recusa (CFM 2.314 art. 4º, art. 6º §4º e §5º; Lei 14.510 art. 26-A III, 26-C)
- O médico informa a limitação de não haver exame físico completo.
- Médico e paciente podem interromper e optar pelo presencial a qualquer momento.
- O médico decide se usa a telemedicina, inclusive na primeira consulta.
- → O termo cita a limitação e o direito de recusa. A consulta tem desfecho "encaminhado ao
  presencial". O paciente tem botão "prefiro presencial", que encerra e registra.

### Prontuário e registro (CFM 2.314 art. 3º; art. 13; Lei 13.787)
- Todo teleatendimento é registrado em prontuário ou SRES, com interoperabilidade.
- SRES em NGS2 / ICP-Brasil (§2º). **O open-telemed não é o prontuário**: ele entrega o registro
  da consulta ao sistema do tenant (webhook e API) e guarda só o necessário.
- O paciente tem direito a cópia (§6º). O médico assistente tem acesso durante todo o prazo legal (§8º).
- Documento emitido a distância registra: médico (nome, CRM, endereço profissional), paciente
  (dados e **local informado do atendimento**), data e hora, assinatura ICP-Brasil e **"emitido em
  modalidade de telemedicina"** (art. 13).
- → Registro da consulta com médico (nome, CRM, UF, RQE opcional), paciente (nome, documento
  opcional, local informado), horários de início e fim, desfecho e modalidade "teleconsulta".
  Exportável por API. Política de retenção configurável, com padrão de 20 anos para o que for
  registro clínico.

### Quem opera a plataforma (CFM 2.314 art. 17; Lei 14.510 art. 3º; CFM 2.299 art. 5º e art. 8º)
- A pessoa jurídica que presta telemedicina ou opera a plataforma tem **sede no Brasil, inscrição
  no CRM do estado sede e diretor técnico médico**.
- A plataforma de prescrição garante que o prescritor é médico regular (Cadastro Nacional de
  Médicos do CFM ou certificado de atributo).
- → Cada tenant guarda razão social, CNPJ, CRM-PJ, UF e diretor técnico (nome, CRM/UF). O rodapé
  da página do paciente mostra isso, porque o white label não pode esconder quem responde.
  O CRM do médico é validado no formato agora; a consulta ao CFM fica para depois.

### Médico em outro estado (Lei 14.510 art. 26-H)
- Atender **só** por telessaúde em outro estado não exige inscrição secundária.
- → Não bloquear por UF do paciente.

### Gravação
- Não é obrigatória (considerandos da CFM 2.314).
- → Desligada por padrão. Se um dia existir, pede **consentimento separado** e mostra aviso
  visível. Nesta etapa só guardamos a escolha.

### Documentos: receita e atestado (CFM 2.299; CFM 2.381; Lei 14.063 art. 13; RDC 1.000/2025)
- Exigem assinatura digital ICP-Brasil NGS2 e validação pelo ITI (validar.iti.gov.br) ou pelo CFM.
- Receita de controlado (Portaria 344/98): só assinatura **qualificada** ICP-Brasil. Receita comum
  e de retenção (antimicrobiano, GLP-1) aceitam assinatura avançada (gov.br).
- Conteúdo mínimo: nome e CRM/UF do médico, RQE quando houver, nome e documento do paciente, data e
  hora, assinatura, contato e endereço profissional. No atestado, dias de afastamento; CID só com
  autorização do paciente.
- Atesta CFM: **não** é obrigatório enquanto a liminar valer.
- → **Fora desta etapa.** Deixamos o modelo pronto para anexar documentos assinados por fora, como
  o Portal de Prescrição Eletrônica do CFM, que é gratuito.

### LGPD
- Dado de saúde é sensível. Base legal: tutela da saúde (art. 11, II, f) e o consentimento da CFM.
- → Minimização. Nada clínico vai para o LiveKit: o metadata do participante leva só o papel, e o
  nome de exibição é o primeiro nome. Logs sem CPF. Trilha de auditoria append-only.
  Isolamento estrito entre tenants.

### Interoperabilidade (fase 2)
- RNDS e BR Core FHIR R4: o `br-core-registroatendimentoclinico` cobre telessaúde. O modelo de
  teleconsulta é o RAC com "Modalidade de Telessaúde".
- → O registro exportado usa nomes que mapeiam para o RAC. O FHIR fica para a fase 2.
