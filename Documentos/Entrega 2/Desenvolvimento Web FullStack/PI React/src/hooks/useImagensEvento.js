import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { acessarImagensEvento } from '../services/imagensEvento.js'

export const ContextoImagensEvento=createContext({token:null,consultar:false,alterar:false})
export function useImagensEvento(eventoId) {
  const acesso=useContext(ContextoImagensEvento)
  const [dados,setDados]=useState({imagens:[],erro:'',carregando:false,eventoId,token:acesso.token})
  const controle=useRef(null)
  const revisao=acesso.revisoes?.[eventoId]||0
  const consultar=useCallback(async()=>{
    if(!acesso.consultar||!Number.isSafeInteger(eventoId)||eventoId<=0)return
    controle.current?.abort()
    const controller=new AbortController();controle.current=controller
    setDados({imagens:[],erro:'',carregando:true,eventoId,token:acesso.token})
    try {
      const imagens=await acessarImagensEvento({token:acesso.token,eventoId,signal:controller.signal,habilitado:true})
      if(controller.signal.aborted)return false
      setDados({imagens,erro:'',carregando:false,eventoId,token:acesso.token})
      return true
    }catch(e){if(!controller.signal.aborted)setDados({imagens:[],erro:e.message,carregando:false,eventoId,token:acesso.token});return false}
  },[acesso.consultar,acesso.token,eventoId])
  useEffect(()=>{
    if(!acesso.consultar||!Number.isSafeInteger(eventoId)||eventoId<=0)return
    const inicial=setTimeout(()=>{void consultar()},0)
    const timer=setInterval(()=>{void consultar()},100000)
    return()=>{clearTimeout(inicial);clearInterval(timer);controle.current?.abort()}
  },[consultar,acesso.consultar,eventoId,revisao])
  const atuais=acesso.consultar&&dados.eventoId===eventoId&&dados.token===acesso.token
  return {...acesso,...(atuais?dados:{imagens:[],erro:'',carregando:acesso.consultar&&Number.isSafeInteger(eventoId)&&eventoId>0}),recarregar:consultar}
}
