import type { Message } from './types'

export type FilePreviewKind = 'image'|'video'|'audio'|'pdf'|'html'|'text'

export function filePreviewKind(message:Pick<Message,'type'|'mime'|'fileName'>):FilePreviewKind|null {
  if(message.type!=='file')return null
  const mime=(message.mime??'').split(';')[0].toLowerCase(),ext=(message.fileName??'').toLowerCase().split('.').pop()??''
  if(mime.startsWith('image/')||['jpg','jpeg','png','gif','webp','avif','bmp','svg'].includes(ext))return 'image'
  if(mime.startsWith('video/')||['mp4','webm','mov','m4v'].includes(ext))return 'video'
  if(mime.startsWith('audio/')||['mp3','m4a','wav','ogg'].includes(ext))return 'audio'
  if(mime==='application/pdf'||ext==='pdf')return 'pdf'
  if(['text/html','application/xhtml+xml'].includes(mime)||['html','htm'].includes(ext))return 'html'
  if(mime.startsWith('text/')||['application/json','application/xml','application/javascript'].includes(mime)||['txt','md','csv','log','json','xml'].includes(ext))return 'text'
  return null
}
