import type { Message } from './types'

type AudioContextConstructor = typeof AudioContext
type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: AudioContextConstructor }

let audioContext: AudioContext | undefined
let unlockCleanup: (() => void) | undefined

export function shouldPlayIncomingMessageSound(message: Message, currentSessionId: string | undefined, routePath: string) {
  return routePath === '/app' && Boolean(message.id) && message.sourceSessionId !== currentSessionId
}

function contextConstructor() {
  const audioWindow = window as AudioWindow
  return audioWindow.AudioContext ?? audioWindow.webkitAudioContext
}

async function unlockAudio() {
  const Constructor = contextConstructor()
  if (!Constructor) return
  audioContext ??= new Constructor()
  if (audioContext.state === 'suspended') await audioContext.resume()
}

export function armIncomingMessageSound() {
  if (unlockCleanup) return unlockCleanup
  const unlock = () => {
    void unlockAudio().catch(() => undefined)
    cleanup()
  }
  const cleanup = () => {
    document.removeEventListener('pointerdown', unlock)
    document.removeEventListener('keydown', unlock)
    document.removeEventListener('touchstart', unlock)
    unlockCleanup = undefined
  }
  document.addEventListener('pointerdown', unlock, { passive: true })
  document.addEventListener('keydown', unlock)
  document.addEventListener('touchstart', unlock, { passive: true })
  unlockCleanup = cleanup
  return cleanup
}

function playTone(context: AudioContext, frequency: number, startsAt: number, duration: number, volume: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequency, startsAt)
  gain.gain.setValueAtTime(0.0001, startsAt)
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  oscillator.connect(gain).connect(context.destination)
  oscillator.start(startsAt)
  oscillator.stop(startsAt + duration + 0.01)
}

export function playIncomingMessageSound() {
  const Constructor = contextConstructor()
  if (!Constructor) return
  audioContext ??= new Constructor()
  const context = audioContext
  const play = () => {
    const now = context.currentTime + 0.01
    playTone(context, 784, now, 0.12, 0.065)
    playTone(context, 1046.5, now + 0.085, 0.17, 0.055)
  }
  if (context.state === 'running') play()
  else void context.resume().then(play).catch(() => undefined)
}
