[English](ux-plan.md) · **Português**

# Execução da UX/UI

Especificação: `docs/spec-ux-ui.pt.md`. Execução no checkout atual, sem commit e sem alterar a fonte Metronic.

- [x] Shell Demo 1: isolar derivados em `inertia/components/metronic/` e `inertia/css/metronic/`, preservar ReUI/Inertia, marca da clínica, drawer acessível, menu pt-BR e NOTICE.
- [x] Início: serviço com o mesmo escopo de consultas e `canAttend`; hoje em Brasília, espera atual e próximas; cobrir isolamento e visibilidade clínica.
- [x] Consultas: tabela responsiva, filtro, vazio, copiar com feedback e formulário organizado. Sala: estado evidente, vídeo amplo e desfecho em diálogo sem alterar guardas.
- [x] Clínica e profissionais: seções, prévia de marca e estados vazios. Auth: layout branded derivado, textos pt-BR.
- [x] Paciente: câmera → termo → espera → vídeo, progresso acessível, rodapé legal, sem acesso a window na renderização; testar navegação e consentimento.
- [x] Portão completo em Node 24 com memória e workers limitados; prints reais a 390/1280 no dev 3333; revisão final e `docs/ux-report.pt.md`.

Riscos a verificar: clínica ativa após troca; médico versus gestor sem ownership; espera de consulta agendada em outro dia; consultas futuras além das 100 da lista; cópia recusada pelo navegador; câmera negada; consentimento não marcado; diálogo via portal mantendo marca; overflow e foco no celular.

Portão final: lint e typecheck exit 0; Japa 241/241 (39 s), Vitest 70/70 em 15 arquivos (4,61 s). Evidências e limites em `docs/ux-report.pt.md`. Revisão independente e correções concluídas; 33 prints em 390/1280 px.
