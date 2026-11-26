**English** · [Português](brazil-telemedicine-rules.pt.md)

# Telemedicine rules in Brazil — what becomes a product requirement

Research dated 2026-11-25. Each line cites the rule; "→" is what open-telemed needs to do.
This is not legal advice: before production, a healthcare lawyer reviews it.

## Rules in force

| Rule | Status as of 2026-11 | Source |
|---|---|---|
| Lei 14.510/2022 (telehealth, amends Lei 8.080) | in force | planalto.gov.br/ccivil_03/_ato2019-2022/2022/lei/l14510.htm |
| Resolução CFM 2.314/2022 (telemedicine) | in force | sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf |
| Resolução CFM 2.299/2021 (electronic medical documents) | in force | sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2021/2299_2021.pdf |
| Resolução CFM 2.381/2024 (minimum content of a medical document) | in force | via jb.com.br, 2026-11-07 |
| Resolução CFM 2.382/2024 (Atesta CFM mandatory) | **suspended by injunction** (case 1087770-91.2024.4.01.3400); CFM confirmed on 2026-10-02 | sistemas.cfm.org.br/.../2382_2024.pdf |
| Lei 14.063/2020 art. 13 + ANVISA RDC 1.000/2025 (digital prescription) | in force | gov.br/anvisa (Perguntas e respostas RDC 1000/2025) |
| Lei 13.787/2018 (electronic health records law) | in force: minimum retention of 20 years | — |
| LGPD (Lei 13.709/2018, the data protection law), health data is sensitive data (art. 11) | in force | — |
| RNDS (national health data network): RAC (Portaria GM/MS 8.347/2025), teleconsultation = RAC + "Modalidade de Telessaúde" (telehealth modality) | RAC published; the teleconsultation model was awaiting a ministerial ordinance | fhir.saude.gov.br/rac/ · hl7.org.br/fhir/core |

## Requirements

### Consent (CFM 2.314 art. 15 and sole paragraph; Lei 14.510 art. 26-A II, 26-G I)
- The patient or legal representative authorizes **the remote care and the transmission of images and
  data**, by electronic means or by recording a reading of the text. The record is part of the
  medical chart.
- Consent is **explicit**: the patient knows the data may be shared and that they may refuse,
  except in an emergency.
- → Consent text versioned per tenant. We store the acceptance with the text version, text hash, date and time,
  IP, user-agent and, when applicable, the legal representative's name and document. The video token is only issued
  after acceptance.

### Limitations and right to refuse (CFM 2.314 art. 4, art. 6 §4 and §5; Lei 14.510 art. 26-A III, 26-C)
- The physician informs the patient of the limitation that there is no complete physical exam.
- Physician and patient may interrupt and opt for an in-person visit at any time.
- The physician decides whether to use telemedicine, including in the first consultation.
- → The consent text mentions the limitation and the right to refuse. The consultation has an outcome "referred to
  in-person care". The patient has a "prefiro presencial" (I prefer in-person) button, which ends the call and records it.

### Medical chart and records (CFM 2.314 art. 3; art. 13; Lei 13.787)
- Every remote care session is recorded in the medical chart or SRES (electronic health record system), with interoperability.
- SRES at NGS2 / ICP-Brasil (§2). **open-telemed is not the medical chart**: it hands the consultation
  record to the tenant's system (webhook and API) and stores only what is necessary.
- The patient has the right to a copy (§6). The attending physician has access for the whole legal period (§8).
- A document issued remotely records: physician (name, CRM, professional address), patient
  (data and **location reported for the consultation**), date and time, ICP-Brasil signature and **"issued
  via telemedicine"** (art. 13).
- → Consultation record with physician (name, CRM, state, optional RQE), patient (name, optional document,
  reported location), start and end times, outcome and modality "teleconsultation".
  Exportable via API. Configurable retention policy, with a default of 20 years for whatever is a
  clinical record.

### Who operates the platform (CFM 2.314 art. 17; Lei 14.510 art. 3; CFM 2.299 art. 5 and art. 8)
- The legal entity that provides telemedicine or operates the platform has **headquarters in Brazil, registration
  with the CRM of the headquarters state and a physician technical director**.
- The prescription platform ensures the prescriber is a physician in good standing (CFM's Cadastro Nacional de
  Médicos, the national physician registry, or an attribute certificate).
- → Each tenant stores legal name, CNPJ, CRM-PJ, state and technical director (name, CRM/state). The footer
  of the patient page shows this, because white label cannot hide who is responsible.
  The physician's CRM is validated for format now; the CFM lookup is left for later.

### Physician in another state (Lei 14.510 art. 26-H)
- Providing care **only** by telehealth in another state does not require secondary registration.
- → Do not block by the patient's state.

### Recording
- Not mandatory (recitals of CFM 2.314).
- → Off by default. If it ever exists, it asks for **separate consent** and shows a
  visible notice. At this stage we only store the choice.

### Documents: prescription and medical certificate (CFM 2.299; CFM 2.381; Lei 14.063 art. 13; RDC 1.000/2025)
- They require an ICP-Brasil NGS2 digital signature and validation by ITI (validar.iti.gov.br) or by CFM.
- Controlled-substance prescription (Portaria 344/98): **qualified** ICP-Brasil signature only. Ordinary
  and retention prescriptions (antimicrobial, GLP-1) accept an advanced signature (gov.br).
- Minimum content: physician's name and CRM/state, RQE when applicable, patient's name and document, date and
  time, signature, professional contact and address. On the certificate, days of leave; ICD code only with
  the patient's authorization.
- Atesta CFM: **not** mandatory while the injunction stands.
- → **Out of scope for this stage.** We leave the model ready to attach documents signed externally, such as
  CFM's Portal de Prescrição Eletrônica (electronic prescription portal), which is free.

### LGPD
- Health data is sensitive. Legal basis: protection of health (art. 11, II, f) and the CFM consent.
- → Minimization. Nothing clinical goes to LiveKit: the participant metadata carries only the role, and the
  display name is the first name. Logs without CPF. Append-only audit trail.
  Strict isolation between tenants.

### Interoperability (phase 2)
- RNDS and BR Core FHIR R4: `br-core-registroatendimentoclinico` covers telehealth. The teleconsultation
  model is the RAC with "Modalidade de Telessaúde" (telehealth modality).
- → The exported record uses names that map to the RAC. FHIR is left for phase 2.
