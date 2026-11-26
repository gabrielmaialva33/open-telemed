import '@livekit/components-styles'
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  TrackToggle,
  DisconnectButton,
  useTracks,
  useConnectionState,
} from '@livekit/components-react'
import { Track, ConnectionState } from 'livekit-client'
import { useState } from 'react'
import type { VideoSession } from './types'
function Conference() {
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])
  const state = useConnectionState()
  return (
    <>
      <div className="video-status" role="status">
        {state === ConnectionState.Connected
          ? 'Conectado · Consulta não gravada'
          : 'Conectando à sala…'}
      </div>
      <GridLayout tracks={tracks} className="consultation-grid">
        <ParticipantTile />
      </GridLayout>
      <RoomAudioRenderer />
      <div className="lk-control-bar">
        <TrackToggle source={Track.Source.Microphone}>Microfone</TrackToggle>
        <TrackToggle source={Track.Source.Camera}>Câmera</TrackToggle>
        <DisconnectButton>Sair da sala</DisconnectButton>
      </div>
    </>
  )
}
export function VideoRoom({ session, onLeave }: { session: VideoSession; onLeave: () => void }) {
  const [error, setError] = useState('')
  return (
    <section className="video-room" aria-label="Sala de teleconsulta">
      {error && (
        <p className="tm-error" role="alert">
          {error}
        </p>
      )}
      <LiveKitRoom
        serverUrl={session.url}
        token={session.token}
        connect
        video
        audio
        onDisconnected={onLeave}
        onError={() =>
          setError('Falha na conexão ou nas permissões de mídia. Saia e tente novamente.')
        }
        data-lk-theme="default"
      >
        <Conference />
      </LiveKitRoom>
    </section>
  )
}
