import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL_NAME = 'quark-presence'

export function usePresence(user) {
  useEffect(() => {
    if (!user) return

    const channel = supabase.channel(CHANNEL_NAME, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {})
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: user.id,
            email: user.email,
            online_at: new Date().toISOString(),
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])
}
