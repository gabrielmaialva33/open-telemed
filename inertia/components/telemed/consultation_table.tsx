import { Link } from '@inertiajs/react'
import { CalendarDays, ArrowUpRight } from 'lucide-react'
import { dateLabel, statusLabels, type Consultation } from './types'

export function ConsultationTable({
  consultations,
  filtered = false,
  onClear,
  roomActions = false,
}: {
  consultations: (Consultation & { canAttend?: boolean })[]
  filtered?: boolean
  onClear?: () => void
  roomActions?: boolean
}) {
  if (!consultations.length)
    return (
      <div className="empty-state">
        <CalendarDays className="mx-auto mb-3 size-8 text-primary" />
        <h3 className="font-semibold text-foreground">
          {filtered ? 'Nenhuma consulta neste status' : 'Sua agenda está livre por aqui'}
        </h3>
        <p className="mt-2 text-sm">
          {filtered
            ? 'Escolha outro status para ver os atendimentos.'
            : 'As consultas agendadas aparecerão nesta lista.'}
        </p>
        {filtered && (
          <button className="tm-button outline mt-4" onClick={onClear}>
            Limpar filtro
          </button>
        )}
      </div>
    )
  return (
    <table className="consultation-table">
      <caption className="sr-only">Consultas e seus status. Horário de Brasília.</caption>
      <thead>
        <tr>
          <th>Paciente</th>
          <th>Data e hora</th>
          <th>Status</th>
          <th>
            <span className="sr-only">Ações</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {consultations.map((c) => (
          <tr key={c.id}>
            <td>
              <div className="flex items-center gap-3">
                <span className="patient-avatar shrink-0" aria-hidden="true">
                  {c.patient_name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <strong>{c.patient_name}</strong>
                  <span className="block text-xs text-muted-foreground">{c.patient_location}</span>
                </div>
              </div>
            </td>
            <td data-label="Data e hora">{dateLabel(c.scheduled_at)}</td>
            <td data-label="Status">
              <span className={`status-badge ${c.status}`}>{statusLabels[c.status]}</span>
            </td>
            <td>
              <Link
                className={
                  roomActions && c.canAttend
                    ? 'tm-button'
                    : 'row-link inline-flex items-center gap-1'
                }
                href={`/consultations/${c.id}${roomActions && c.canAttend ? '/room' : ''}`}
                aria-label={`${roomActions && c.canAttend ? 'Abrir sala' : 'Ver consulta'} de ${c.patient_name}`}
              >
                {roomActions && c.canAttend ? 'Abrir sala' : 'Ver consulta'}{' '}
                <ArrowUpRight size={15} />
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
