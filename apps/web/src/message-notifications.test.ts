import { describe, expect, it } from 'vitest'
import { shouldPlayIncomingMessageSound } from './message-notifications'
import type { Message } from './types'

const message=(sourceSessionId?:string):Message=>({id:'message-1',type:'text',content:'hello',sourceSessionId,visibility:'normal',favorite:false,pinned:false,createdAt:1,updatedAt:1})

describe('incoming message notification',()=>{
  it('plays only for another session while the conversation page is open',()=>{
    expect(shouldPlayIncomingMessageSound(message('other-session'),'current-session','/app')).toBe(true)
    expect(shouldPlayIncomingMessageSound(message(),'current-session','/app')).toBe(true)
    expect(shouldPlayIncomingMessageSound(message('current-session'),'current-session','/app')).toBe(false)
    expect(shouldPlayIncomingMessageSound(message('other-session'),'current-session','/app/settings')).toBe(false)
  })
})
