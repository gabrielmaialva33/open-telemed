[English](spec-ux-ui.md) · **Português**

# Spec: UX/UI do open-telemed com o Metronic

O painel e a página do paciente funcionam, mas parecem kit cru. Um exemplo: no menu, "Consultas" e
"Dashboard" usam o mesmo ícone de casa, e "Dashboard" e "Settings" seguem em inglês. Meta: o
open-telemed ter cara de produto, com o **Metronic v9.5.0** como base visual.

## Metronic: decisão do dono

- Ele comprou o Metronic e escolheu **copiar o código dele** (componentes, layout, CSS e ícones) para
  dentro do repo, em vez de usá-lo só como referência.
- Consequência aceita: enquanto houver código do Metronic, o repo **não pode ser publicado** como
  open source. A licença do Metronic é da Envato, comercial e de uso único.
- Para manter a saída aberta, todo arquivo copiado ou derivado do Metronic fica **identificável e
  removível**:
  - numa pasta própria (sugestão: `inertia/components/metronic/` e `inertia/css/metronic/`);
  - com um cabeçalho de 1 linha:
    `// Derivado do Metronic v9.5.0 (Keenthemes), licença comercial: não redistribuir.`
- Anote isso no `NOTICE`. Não mexa no `LICENSE`: a licença é decisão do dono.
- Fonte: `~/Projects/personal/metronic-v9.5.0/`. **Só leitura**: não altere nada lá.
  - `metronic-tailwind-react-demos/typescript/vite/src/layouts/demo1..demo10`: layouts completos
    (sidebar, header, toolbar). Escolha **um** e justifique no relatório. O demo1, de sidebar
    clássica, é o ponto de partida provável.
  - `metronic-tailwind-react-starter-kit/typescript/vite/src/components/layouts/layout-*`:
    variações de layout.
  - `figma/Metronic_v9.5.0.fig`: o design.
- O Metronic React usa React 19, Tailwind 4, radix-ui, lucide e componentes ReUI. A pasta
  `inertia/components/ui/` do kit já tem esses mesmos componentes ReUI: reaproveite em vez de
  duplicar. O Metronic usa `react-router`; aqui a navegação é Inertia (`Link` e `router` de
  `@inertiajs/react`), e nada de react-router entra.

## O que melhorar

1. **Shell do painel** (`inertia/layouts/main/`): sidebar, header, troca de clínica e menu do
   usuário no padrão do layout escolhido.
   - Menu em pt-BR, com ícone próprio e distinto para cada item. Hoje `sidebar.tsx` repete `Home`
     e `Settings`.
   - No topo da sidebar vão o logo e o nome da **clínica ativa** (white label). "Open Telemed" só
     aparece quando não há clínica.
   - Celular: menu em drawer, sem rolagem horizontal.
2. **Início em vez de "Dashboard"**: uma tela útil para quem atende. Ela mostra as consultas de
   hoje, quem está **na sala de espera agora** (com destaque e ação direta para a sala) e as
   próximas consultas. Os cards do kit que não têm a ver com telemedicina saem. O gestor vê o
   resumo da clínica, e o médico vê as próprias consultas, respeitando as permissões que já
   existem.
3. **Consultas**: lista como tabela ou data grid com filtro por status, badges de status em pt-BR
   e estado vazio decente. O formulário de nova consulta e o detalhe ficam com hierarquia clara,
   e o link do paciente ganha botão de copiar e feedback.
4. **Sala do médico**: estado do paciente (aguardando, consentiu, na espera) bem visível, e
   "Admitir" como ação principal. O vídeo ocupa a área útil, e "Encerrar" com desfecho vai num
   diálogo.
5. **Clínica e Profissionais**: as configurações em abas ou seções (Marca, Dados legais, Termo,
   Webhook), com prévia da marca.
6. **Paciente** (`/c`, pública): pensada primeiro para celular. Mostra uma etapa por vez (câmera,
   termo, espera, vídeo), com indicador de progresso, textos curtos e botão grande. O rodapé
   legal continua aparecendo.
7. **Login** e as telas de auth no visual do Metronic, com a marca.
8. Itens do kit que não servem ao produto saem do menu: as demos já estão desligadas, mas confira
   "Settings" e "Files". Traduza o que ficar.

## Regras que não mudam

- **Nada de regra de negócio ou de autorização muda.** Exemplos: `canAttend` (só o médico da
  consulta admite, pega token e encerra) e o fluxo termo → espera → admitido. Isso inclui não
  esconder nem mostrar um controle que hoje a regra decide.
- **White label**: a cor da clínica (`--brand` e as CSS variables existentes, inclusive as
  `--lk-*` do LiveKit) continua mandando no primário. Teste com as duas clínicas do seed: a
  Aurora é verde e a Horizonte é roxa. O Metronic não pode fixar o azul dele.
- A página pública continua sem dados de quem está logado.
- Todo texto de interface em pt-BR. Identificadores e comentários de código em inglês.
- SSR: nada de `typeof window` no corpo do componente.

## Ambiente

- Um `pnpm dev` já roda em http://localhost:3333: foi o Claude que subiu, para o dono olhar. Use
  esse servidor para os prints.
- Se ele atrapalhar a suíte de navegador (por exemplo, disputa da porta 24678 do Vite), pode
  pará-lo. No fim, deixe um `pnpm dev` rodando de novo na 3333.
- Logins do seed: README, senha `TelemedDemo2026!`.
- O banco de dev fica no host Docker, na porta 5434. Os testes usam o `open_telemed_test`.
- Node 24: `mise exec node@24.21.0 -- pnpm …`.
- Suítes com poucos workers e dentro de um scope com memória limitada (a máquina tem 31 GiB e o
  earlyoom já matou runner), por exemplo:
  `systemd-run --user --scope -p MemoryHigh=14G -p MemoryMax=16G -p MemorySwapMax=2G -p OOMPolicy=kill -- pnpm test:e2e`.
- **Não faça commit**: quem commita é o dono.

## Critérios de aceite

1. `pnpm lint`, `pnpm typecheck`, `pnpm test:e2e` e `pnpm test:ui` passam. Teste que só checava
   texto ou estrutura antiga pode ser atualizado. Teste de regra (acesso, tenant, consentimento)
   não pode ser afrouxado.
2. Prints a 390 e 1280 px, em `docs/screenshots/ux/`:
   - Início, Consultas, detalhe, sala do médico e Clínica, com a Aurora;
   - a mesma sala com a Horizonte, para provar o white label;
   - as 4 etapas do paciente;
   - o login.
3. Relatório curto em `docs/ux-report.pt.md`: o layout do Metronic escolhido e o porquê, o que
   foi copiado (lista de arquivos), o que mudou em cada tela e o que ficou para depois.
