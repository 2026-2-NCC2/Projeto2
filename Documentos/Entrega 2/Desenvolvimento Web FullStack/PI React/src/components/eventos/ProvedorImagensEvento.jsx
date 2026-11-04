import { useCallback, useEffect, useState } from 'react'
import { ContextoImagensEvento } from '../../hooks/useImagensEvento.js'
import { capacidadesImagensEvento } from '../../services/imagensEvento.js'

export function ProvedorImagensEvento({token,children}) {
  const [capacidades,setCapacidades]=useState({consultar:false,alterar:false})
  const [revisoes,setRevisoes]=useState({})
  const invalidarEvento=useCallback(id=>setRevisoes(antes=>({...antes,[id]:(antes[id]||0)+1})),[])
  useEffect(()=>{
    const controle=new AbortController()
    capacidadesImagensEvento(token,controle.signal).then(d=>{if(!controle.signal.aborted)setCapacidades(d)}).catch(()=>{
      if(!controle.signal.aborted)setCapacidades({consultar:false,alterar:false})
    })
    return()=>controle.abort()
  },[token])
  return <ContextoImagensEvento.Provider value={{token,...capacidades,revisoes,invalidarEvento}}>{children}</ContextoImagensEvento.Provider>
}
