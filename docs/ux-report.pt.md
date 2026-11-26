[English](ux-report.md) · **Português**

# Relatório UX/UI — Open Telemed

26/11/2026 · Escopo: `docs/spec-ux-ui.pt.md`. Implementado no checkout atual, sem commit, staging, push ou alteração de `LICENSE`. A distribuição original do Metronic foi somente consultada.

## Layout e origem

Escolhido **Demo 1**: sidebar clássica, cabeçalho fixo e conteúdo amplo combinam com agenda, gestão da clínica e atendimento. O drawer móvel reaproveita o Sheet/ReUI existente; navegação e troca de clínica continuam em Inertia. Nenhuma dependência foi adicionada.

Derivados isolados, todos com cabeçalho de atribuição, também enumerados em `NOTICE`:

| Arquivo                                          | Origem/adaptação                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `inertia/components/metronic/shell.tsx`          | `layouts/demo1/layout.tsx`, sidebar, sidebar-header e header; marca ativa, drawer e estrutura React/Inertia |
| `inertia/components/metronic/sidebar_nav.tsx`    | Composição da navegação Demo 1 integrada ao menu e permissões do kit                                        |
| `inertia/components/metronic/header_actions.tsx` | Composição do header Demo 1 integrada aos menus de clínica/usuário do kit                                   |
| `inertia/components/metronic/auth_layout.tsx`    | `auth/layouts/branded.tsx`, sem imagens ou logotipos da distribuição                                        |
| `inertia/css/metronic/demo1.css`                 | `css/demos/demo1.css`, adaptado ao escopo do componente e à ordem das camadas Tailwind                      |

Os adapters em `inertia/layouts/` apontam para esses componentes. ReUI existente foi reutilizado. Conforme a decisão da especificação, **o checkout com esses derivados comerciais não deve ser publicado como open source**; remover a dependência exige substituir essas pastas e seus imports/adapters.

## Entrega por tela

- **Shell:** clínica ativa no topo, logo configurado ou símbolo de fallback; Início, Consultas, Profissionais e Clínica com ícones distintos. Files, Settings, administração genérica do kit e demos saíram do menu. Drawer com foco gerenciado, fechamento ao navegar e link para pular ao conteúdo. Menus em portal recebem a marca; salvar a marca atualiza o shell imediatamente.
- **Início:** agenda de hoje em Brasília, pacientes aguardando agora e seis próximas consultas a partir de amanhã. Espera inclui pacientes cuja data agendada não é hoje. Gestor vê a clínica; médico vê suas consultas. Acesso direto à sala depende de `canAttend`. Atualização a cada dez segundos. A métrica “Encerradas da agenda de hoje” não confunde ausência/recusa com atendimento concluído.
- **Consultas:** tabela que se reorganiza no celular, filtro de status, badges em português, estado vazio com limpeza do filtro e formulário de agendamento com orientação. Mantido o limite existente de cem consultas, agora explícito. Link do paciente com confirmação de cópia e alternativa manual se o navegador recusar.
- **Detalhe/sala:** estado e consentimento evidentes; admissão como ação principal. Vídeo ocupa toda a largura disponível antes dos detalhes. Encerramento abre diálogo com desfecho e confirmação. Guardas de atendimento e cancelamento preservadas.
- **Clínica/profissionais:** seções Marca, Dados legais, Termo e Webhook, atalhos e prévia viva da marca; equipe com contador, vazio e cadastro/edição organizados.
- **Paciente:** câmera → termo → espera → vídeo, uma etapa por vez, indicador acessível, retorno à câmera, botões amplos e rodapé legal em todas as etapas. Consentimento e gravação seguem desmarcados inicialmente. Base da rota obtida do Inertia, sem consultar `window` no corpo do componente.
- **Auth:** layout branded, textos em português, marca do domínio da clínica ou Open Telemed na plataforma; erro de login visível. Removido o botão de ferramentas de desenvolvimento das telas do produto.

Nenhuma migration, regra de autorização, transição clínica ou contrato de API foi alterado. `visibleQuery` extrai o filtro já existente da lista para o Início; `ConsultationAccessService` não foi modificado. A página pública mantém o bloqueio de compartilhamento de dados autenticados.

## Portão final

| Comando                       | Resultado                                                           |
| ----------------------------- | ------------------------------------------------------------------- |
| `pnpm lint`                   | Exit 0; **0 erros**                                                 |
| `pnpm typecheck`              | Exit 0; **0 erros**, backend e frontend                             |
| `pnpm test:e2e`               | **241/241 testes**, exit 0, 39 s; unitários, funcionais e navegador |
| `pnpm test:ui --maxWorkers=2` | **70/70 testes em 15 arquivos**, exit 0, 4,61 s                     |
| `git diff --check`            | Exit 0                                                              |

Node **24.21.0** via Mise. Japa sequencial em scope com `MemoryHigh=8G`, `MemoryMax=10G`, `MemorySwapMax=2G`, `OOMPolicy=kill`; Vitest com dois workers, limites 4G/6G/1G. Logs em `~/.cache/agents/2026-11-26-open-telemed-ux/`, arquivos `lint-final.log`, `typecheck-final.log`, `e2e-final.log`, `ui-final.log` e `screenshots.log`.

Regressões novas: escopo tenant/médico, permissão apenas de dashboard, fronteiras de dia em Brasília, espera de outra data, próximas consultas além das cem da lista, branding de login por domínio, filtro/vazio, diálogo, etapas/consentimento, cópia recusada, atualização de marca e portais. Testes existentes de regra foram preservados. No browser, há verificação do tema interno do LiveKit, ausência de overflow e conteúdo abaixo do cabeçalho.

Houve RED/GREEN para filtro/diálogo, etapas do paciente, overview, marca e feedback de login. Revisão independente estática encontrou atualização de marca, portais e rótulo da métrica; os três foram corrigidos. A inspeção visual também corrigiu a camada CSS do cabeçalho e o azul definido internamente pelo tema LiveKit. Duas fixtures novas de host foram ajustadas à allowlist já existente do Vite, sem mudar sua configuração. Permanecem avisos não bloqueantes do pnpm sobre variável de configuração ausente e do LiveKit ao fechar DataChannels. Build não foi executado nesta etapa.

## Prints e verificação visual

**33 PNGs** reais do servidor `http://localhost:3333`, a **390 e 1280 px**, inspecionados. Índice e cores medidas em [`screenshots/ux/verification.json`](screenshots/ux/verification.json).

| Tela                  | 390 px                                           | 1280 px                                           |
| --------------------- | ------------------------------------------------ | ------------------------------------------------- |
| Início Aurora, gestor | [abrir](screenshots/ux/aurora-home-390.png)    | [abrir](screenshots/ux/aurora-home-1280.png)    |
| Consultas Aurora      | [abrir](screenshots/ux/aurora-consultations-390.png) | [abrir](screenshots/ux/aurora-consultations-1280.png) |
| Detalhe Aurora        | [abrir](screenshots/ux/aurora-detail-390.png)   | [abrir](screenshots/ux/aurora-detail-1280.png)   |
| Sala Aurora           | [abrir](screenshots/ux/aurora-room-390.png)      | [abrir](screenshots/ux/aurora-room-1280.png)      |
| Clínica Aurora        | [abrir](screenshots/ux/aurora-clinic-390.png)   | [abrir](screenshots/ux/aurora-clinic-1280.png)   |
| Sala Horizonte        | [abrir](screenshots/ux/horizonte-room-390.png)   | [abrir](screenshots/ux/horizonte-room-1280.png)   |
| Paciente: câmera      | [abrir](screenshots/ux/patient-camera-390.png)  | [abrir](screenshots/ux/patient-camera-1280.png)  |
| Paciente: termo       | [abrir](screenshots/ux/patient-consent-390.png)   | [abrir](screenshots/ux/patient-consent-1280.png)   |
| Paciente: espera      | [abrir](screenshots/ux/patient-waiting-390.png)  | [abrir](screenshots/ux/patient-waiting-1280.png)  |
| Paciente: vídeo       | [abrir](screenshots/ux/patient-video-390.png)   | [abrir](screenshots/ux/patient-video-1280.png)   |
| Login                 | [abrir](screenshots/ux/login-390.png)            | [abrir](screenshots/ux/login-1280.png)            |

Extras: Início do médico, profissionais, sala antes da admissão nas duas clínicas, diálogo de encerramento e drawer móvel. Captura com dois contextos isolados, câmera/microfone simulados e duas faixas de vídeo decodificadas por participante; **zero exceções JavaScript**. No elemento interno do LiveKit, Aurora usa `#0f766e` e Horizonte `#6d48a5`.

## Estado entregue e limites

Dev novamente ativo na porta **3333**, via unidade de usuário transitória `open-telemed-ux-dev.service`, com Node 24 e memória limitada. As capturas criaram consultas sintéticas de demonstração pela interface; as chamadas foram encerradas e tentativas abandonadas foram canceladas, preservando auditoria/consentimentos. Uma consulta futura fica disponível na agenda. Foram limpos somente os quatro contadores de login dos usuários de demonstração usados nas capturas, após atingir o limite de tentativas.

Sem commit ou alteração do índice: SHA-256 de `git ls-files -s` antes/depois `6ef9df12ed6bba7289810e72195280a2f79f8412a3a3ac36b7afe2a8ebd51fa1`. `docs/spec-ux-ui.pt.md` já era untracked e foi preservado.

Ficam para depois: paginação/filtro no servidor além das cem consultas existentes, busca na agenda e homologação com dispositivos físicos, Safari/Firefox e rede pública/TURN. Não houve teste de câmera física, deploy ou alteração dos itens clínicos fora desta especificação.
