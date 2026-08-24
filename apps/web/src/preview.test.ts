import { describe, expect, it } from 'vitest'
import { filePreviewKind } from './preview'

describe('file preview classification',()=>{
  const kind=(fileName:string,mime:string)=>filePreviewKind({type:'file',fileName,mime})
  it('covers every supported inline preview type',()=>{expect(kind('photo.jpg','application/octet-stream')).toBe('image');expect(kind('movie.mp4','application/octet-stream')).toBe('video');expect(kind('voice.m4a','application/octet-stream')).toBe('audio');expect(kind('report.pdf','application/octet-stream')).toBe('pdf');expect(kind('page.html','application/octet-stream')).toBe('html');expect(kind('data.json','application/octet-stream')).toBe('text')})
  it('keeps office documents and archives download-only',()=>{expect(kind('sheet.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBeNull();expect(kind('archive.zip','application/zip')).toBeNull()})
})
