[English](spec-headless-integration.md) · **Português**

# Spec: open-telemed headless, com a cara da Clínica Fácil

Respostas do dono às 5 perguntas de `clinicafacil-integration.pt.md` e `review-report.pt.md`.

## As decisões do dono

1. **Tudo por API, e o produto parece da Clínica Fácil.** Quem usa a Clínica Fácil (médico, recepção,
   paciente) não percebe que existe um open-telemed: nenhum segundo login, nenhuma tela com outra
   marca e nenhum domínio estranho. O open-telemed vira o **motor headless** (vídeo, consentimento,
   espera, trilha, regras do CFM). O painel próprio fica só para operação e administração da
   plataforma.
2. **Conciliação agenda ↔ teleconsulta:** o dono pediu que você **proponha o melhor jeito**, olhando
   os dois sistemas.
3. **Quem recebe o link e com qual template:** idem, proponha o melhor jeito.
4. **Snapshot da identidade do médico e autoria do que volta ao prontuário: sim.** Implemente.
5. **Revogação do vídeo no fim da consulta:** idem, proponha o melhor jeito.

## O que fazer

### Desenho

Leia os dois sistemas antes de desenhar. A Clínica Fácil continua **só leitura**: não edite, não
rode teste, dev, migration nem seed lá.

Para cada um dos itens 1, 2, 3 e 5:

- recomende **um** caminho, justificado pelo código das duas pontas;
- registre as alternativas descartadas e o porquê, em poucas linhas.

Pontos que o item 1 precisa resolver:

- **Médico sem segundo login.** O médico atende **dentro da Clínica Fácil**. A Clínica Fácil já
  autentica o usuário, e o open-telemed precisa confiar nisso sem abrir brecha.
  - Hoje o integrador não tem direito de atender, e isso foi decisão de segurança.
  - O desenho novo precisa manter a garantia de que só o médico da consulta admite, pega token e
    encerra.
  - Exemplo de caminho: asserção assinada por consulta e por profissional mapeado, de uso único e
    curta, emitida pelo backend da Clínica Fácil. Proponha o melhor.
- **Paciente.** A página do paciente fica no domínio da Clínica Fácil. Decida entre:
  - página do open-telemed num host da clínica (`custom_hosts` já existe), com a marca da Clínica
    Fácil;
  - a própria Clínica Fácil renderizando o fluxo, falando com a API headless pelo backend dela.

  Em qualquer caso, o paciente segue sem conta e as regras de consentimento não mudam.

- **Vídeo.** Decida se a Clínica Fácil usa `@livekit/components-react` com tokens emitidos pela API.
- **Marca.** Nenhum "powered by" nem rastro de marca do open-telemed na experiência do usuário final.

### Implementação no open-telemed

Implemente o que o desenho pedir, com testes e OpenAPI:

- **API headless** do médico e do paciente, seguindo o desenho do item 1;
- **item 4**: snapshot da identidade do médico na consulta (nome, CRM, UF e RQE no momento do
  atendimento, imutável depois) e a exportação do registro com autoria clara para a Clínica Fácil
  gravar no prontuário dela;
- **item 5**, até onde der neste lado;
- **item 2**: o que o lado do open-telemed precisar, como eventos e estados.

Regra de autorização só fica mais rígida, nunca mais frouxa. Mudança de auth leva modelo de ameaça
curto no documento e testes negativos (outro médico, outra clínica, asserção repetida ou vencida,
gestor tentando atender).

### Documento do lado da Clínica Fácil

Atualize `docs/clinicafacil-integration.md` e o par `.pt.md` com:

- o desenho escolhido;
- o fluxo de ponta a ponta, sem o médico sair da Clínica Fácil;
- os módulos e arquivos da Clínica Fácil que mudam;
- as recomendações dos itens 2, 3 e 5.

Esse documento é a base do ticket e da spec que a Clínica Fácil fará no fluxo dela.

## Convenções

- Doc em inglês no arquivo principal, com par em português `.pt.md`. Nome de arquivo em inglês.
- Crie o `docs/spec-headless-integration.md` (inglês) a partir deste arquivo.
- Nenhum IP, host real ou caminho de máquina em arquivo versionado. Os hosts de teste ficam no
  `.env.test.local`, que está fora do git.
- O repo tem git de novo, com um commit único (`6ccf18e`). **Não faça commit**: quem commita é o
  dono.
- Node 24 (`mise exec node@24.21.0 -- pnpm …`). As suítes rodam num scope com memória limitada,
  como antes.
- Portão: `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e`, `pnpm test:ui` e `pnpm build`.

## Entrega

- `docs/headless-report.md` e o par `.pt.md`: as decisões dos itens 1 a 5, o que foi implementado,
  o que fica do lado da Clínica Fácil e o portão com números.
- Os docs de integração atualizados.
- No chat, um resumo curto.
