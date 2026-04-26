import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

interface SignInData {
  email: string
  password: string
}

interface SignUpData {
  name: string
  email: string
  password: string
}

export function useAuth() {
  const navigate = useNavigate()
  const [isLoading, setIsLoading] = useState(false)

  const signIn = async ({ email, password }: SignInData) => {
    setIsLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao fazer login'
      if (message.includes('Invalid login credentials')) {
        toast.error('Email ou senha incorretos')
      } else {
        toast.error(message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const signUp = async ({ name, email, password }: SignUpData) => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw error

      if (data.user) {
        await supabase.from('profiles').upsert({ id: data.user.id, name })
      }

      toast.success('Conta criada! Faça login para continuar.')
      navigate('/login')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar conta'
      if (message.includes('already registered')) {
        toast.error('Este email já está cadastrado')
      } else {
        toast.error(message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return { signIn, signUp, isLoading }
}
