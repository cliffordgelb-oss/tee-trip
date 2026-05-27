import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Loads everything a tournament view needs, in one hook. Subscribes to
// realtime changes on the tournament-scoped tables and refetches when they fire.
export function useTournament(slug) {
  const [state, setState] = useState({
    loading: true,
    error: null,
    tournament: null,
    players: [],
    rounds: [],
    holes: [],
    scores: [],
    roundStrokes: [],
    messages: [],
    members: [],
    holeEvents: [],
    wolfPicks: [],
  })
  const channelRef = useRef(null)

  const load = useCallback(async () => {
    if (!slug) return
    const { data: t, error: tErr } = await supabase
      .from('tournaments')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()
    if (tErr) { setState(s => ({ ...s, loading: false, error: tErr.message })); return }
    if (!t) { setState(s => ({ ...s, loading: false, error: 'Tournament not found.' })); return }

    const tid = t.id
    const [players, rounds, holes, scores, roundStrokes, messages, members] = await Promise.all([
      supabase.from('players').select('*').eq('tournament_id', tid).order('display_order'),
      supabase.from('rounds').select('*').eq('tournament_id', tid).order('round_number'),
      supabase.from('holes').select('*').eq('tournament_id', tid),
      supabase.from('scores').select('*').eq('tournament_id', tid),
      supabase.from('round_strokes').select('*').eq('tournament_id', tid),
      supabase.from('messages').select('*').eq('tournament_id', tid).order('created_at', { ascending: false }).limit(200),
      supabase.from('tournament_members').select('*').eq('tournament_id', tid),
    ])
    const firstErr = [players, rounds, holes, scores, roundStrokes, messages, members].find(r => r.error)
    if (firstErr) { setState(s => ({ ...s, loading: false, error: firstErr.error.message })); return }

    // hole_events + wolf_picks are newer — soft-fail so a DB that hasn't
    // been migrated yet still loads the tournament view.
    const [holeEventsResult, wolfPicksResult] = await Promise.all([
      supabase.from('hole_events').select('*').eq('tournament_id', tid),
      supabase.from('wolf_picks').select('*').eq('tournament_id', tid),
    ])
    const holeEvents = holeEventsResult.error ? [] : (holeEventsResult.data ?? [])
    const wolfPicks = wolfPicksResult.error ? [] : (wolfPicksResult.data ?? [])

    setState({
      loading: false,
      error: null,
      tournament: t,
      players: players.data ?? [],
      rounds: rounds.data ?? [],
      holes: holes.data ?? [],
      scores: scores.data ?? [],
      roundStrokes: roundStrokes.data ?? [],
      messages: messages.data ?? [],
      members: members.data ?? [],
      holeEvents,
      wolfPicks,
    })
  }, [slug])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!state.tournament?.id) return
    const tid = state.tournament.id
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const ch = supabase.channel(`tt-${tid}`)
    const tables = ['scores', 'round_strokes', 'round_points', 'rounds', 'messages', 'players', 'hole_events', 'wolf_picks']
    for (const table of tables) {
      ch.on('postgres_changes',
        { event: '*', schema: 'public', table, filter: `tournament_id=eq.${tid}` },
        () => load()
      )
    }
    ch.subscribe()
    channelRef.current = ch
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [state.tournament?.id, load])

  return useMemo(() => ({ ...state, refetch: load }), [state, load])
}
