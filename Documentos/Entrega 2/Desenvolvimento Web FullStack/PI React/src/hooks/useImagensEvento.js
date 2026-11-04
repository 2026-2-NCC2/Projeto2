import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { acessarImagensEvento } from '../services/imagensEvento.js'

export const ContextoImagensEvento=createContext({token:null,consultar:false,alterar:false})
export function useImagensEvento(eventoId) {
  const acesso=useContext(ContextoImagensEvento)
  const [dados,setDados]=useState({imagens:[],erro:''})
  const controle=useRef(null)
  const revisao=acesso.revisoes?.[eventoId]||0
  const consultar=useCallback(async()=>{
    if(!acesso.consultar||!Number.isSafeInteger(eventoId)||eventoId<=0)return
    controle.current?.abort()
    const controller=new AbortController();controle.current=controller
    try {
      const imagens=await acessarImagensEvento({token:acesso.token,eventoId,signal:controller.signal,habilitado:true})
      if(!controller.signal.aborted)setDados({imagens,erro:''})
      return true
    }catch(e){if(!controller.signal.aborted)setDados({imagens:[],erro:e.message});return false}
  },[acesso.consultar,acesso.token,eventoId])
  useEffect(()=>{
    if(!acesso.consultar||!Number.isSafeInteger(eventoId)||eventoId<=0)return
    const inicial=setTimeout(()=>{void consultar()},0)
    const timer=setInterval(()=>{setDados({imagens:[],erro:''});void consultar()},100000)
    return()=>{clearTimeout(inicial);clearInterval(timer);controle.current?.abort()}
  },[consultar,acesso.consultar,eventoId,revisao])
  return {...acesso,...(acesso.consultar?dados:{imagens:[],erro:''}),recarregar:consultar}
}
