'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  Bell,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Trophy,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ChevronRight,
  Filter,
  Swords,
  Clock,
  Sparkles,
} from 'lucide-react';

interface NotificationItem {
  type: 'upcoming_match' | 'result' | 'position_change' | 'qualification' | string;
  priority: 'high' | 'medium' | 'low' | string;
  title: string;
  message: string;
  matchday?: number;
  fixtureId?: string;
  timestamp?: string;
  created_at?: string;
}

interface NotificationsApiResponse {
  success?: boolean;
  playerId?: string;
  leagueId?: string;
  notifications: NotificationItem[];
  error?: string;
}

export default function LeagueNotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'all' | 'high' | 'medium' | 'match'>('all');

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        setError('Please sign in to view your notifications.');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/league/notifications/${userId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Failed to fetch notifications (HTTP ${res.status})`);
      }

      const json: NotificationsApiResponse = await res.json();
      if (json.error) {
        throw new Error(json.error);
      }

      setNotifications(json.notifications || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading notifications.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Helper for notification type icons
  const getTypeConfig = (type: string) => {
    switch (type) {
      case 'upcoming_match':
        return {
          emoji: '📅',
          icon: Calendar,
          badgeLabel: 'Upcoming Match',
          badgeStyle: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        };
      case 'result':
        return {
          emoji: '✅',
          icon: CheckCircle2,
          badgeLabel: 'Result',
          badgeStyle: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        };
      case 'position_change':
        return {
          emoji: '📊',
          icon: TrendingUp,
          badgeLabel: 'Standing',
          badgeStyle: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        };
      case 'qualification':
        return {
          emoji: '🏆',
          icon: Trophy,
          badgeLabel: 'Qualification',
          badgeStyle: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
        };
      default:
        return {
          emoji: '🔔',
          icon: Bell,
          badgeLabel: 'Update',
          badgeStyle: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        };
    }
  };

  // Helper for priority borders and styling
  const getPriorityCardStyle = (priority: string) => {
    const prio = (priority || '').toLowerCase();
    if (prio === 'high') {
      return 'border-2 border-red-500/70 bg-gradient-to-r from-red-950/20 via-ccb-card to-ccb-card shadow-lg shadow-red-950/20';
    }
    if (prio === 'medium') {
      return 'border-2 border-blue-500/70 bg-gradient-to-r from-blue-950/20 via-ccb-card to-ccb-card shadow-lg shadow-blue-950/20';
    }
    return 'border border-ccb-border bg-ccb-card hover:border-slate-600';
  };

  // Filtered list
  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'high') {
      return notifications.filter((n) => (n.priority || '').toLowerCase() === 'high');
    }
    if (activeFilter === 'medium') {
      return notifications.filter((n) => (n.priority || '').toLowerCase() === 'medium');
    }
    if (activeFilter === 'match') {
      return notifications.filter((n) => n.type === 'upcoming_match' || n.type === 'result');
    }
    return notifications;
  }, [notifications, activeFilter]);

  // Format timestamp or matchday string
  const formatTimeOrMatchday = (item: NotificationItem) => {
    if (item.timestamp) {
      try {
        return new Date(item.timestamp).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return item.timestamp;
      }
    }
    if (item.created_at) {
      try {
        return new Date(item.created_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch {
        return item.created_at;
      }
    }
    if (item.matchday) {
      return `Matchday ${item.matchday}`;
    }
    return 'Recent';
  };

  return (
    <div className="space-y-6 pb-20 sm:pb-8 text-slate-100 max-w-4xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ccb-border pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/league/dashboard"
            className="p-2 rounded-xl bg-ccb-card border border-ccb-border hover:bg-ccb-surface text-slate-300 hover:text-white transition-colors"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>League Notifications</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-ccb-surface border border-ccb-border text-amber-400 font-mono font-bold">
                {notifications.length}
              </span>
            </h1>
            <p className="text-sm text-ccb-muted mt-0.5">Stay updated on matchdays, results, and rank changes</p>
          </div>
        </div>

        <button
          onClick={fetchNotifications}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-200 bg-ccb-card hover:bg-ccb-surface border border-ccb-border rounded-xl transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 text-ccb-primary ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 text-xs text-ccb-muted mr-1">
          <Filter className="w-3.5 h-3.5" />
          <span>Filter:</span>
        </div>

        <button
          onClick={() => setActiveFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeFilter === 'all'
              ? 'bg-ccb-primary text-white shadow-md shadow-ccb-primary/30'
              : 'bg-ccb-card border border-ccb-border text-ccb-muted hover:text-white'
          }`}
        >
          All ({notifications.length})
        </button>

        <button
          onClick={() => setActiveFilter('high')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeFilter === 'high'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'bg-ccb-card border border-ccb-border text-red-400 hover:bg-red-950/30'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-red-500"></span>
          High Priority
        </button>

        <button
          onClick={() => setActiveFilter('medium')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap flex items-center gap-1.5 ${
            activeFilter === 'medium'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
              : 'bg-ccb-card border border-ccb-border text-blue-400 hover:bg-blue-950/30'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
          Medium Priority
        </button>

        <button
          onClick={() => setActiveFilter('match')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ${
            activeFilter === 'match'
              ? 'bg-slate-700 text-white shadow-md'
              : 'bg-ccb-card border border-ccb-border text-ccb-muted hover:text-white'
          }`}
        >
          Matches & Results
        </button>
      </div>

      {/* Loading Skeleton */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="card h-24 bg-ccb-card/50 border-ccb-border rounded-xl animate-pulse flex items-center p-4 gap-4"
            >
              <div className="w-10 h-10 rounded-xl bg-ccb-border/60 shrink-0"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 w-48 bg-ccb-border/60 rounded"></div>
                <div className="h-3 w-3/4 bg-ccb-border/40 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error Display */}
      {!loading && error && (
        <div className="card text-center py-10 px-4 border border-ccb-border rounded-xl bg-ccb-card">
          <div className="flex justify-center mb-3">
            <AlertCircle className="w-10 h-10 text-amber-400" />
          </div>
          <h2 className="text-base font-bold text-white mb-1">Failed to load notifications</h2>
          <p className="text-xs text-ccb-muted max-w-sm mx-auto mb-5">{error}</p>
          <button
            onClick={fetchNotifications}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-ccb-primary hover:bg-ccb-primaryHover rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Notifications List */}
      {!loading && !error && (
        <div className="space-y-3">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((n, idx) => {
              const typeConfig = getTypeConfig(n.type);
              const cardStyle = getPriorityCardStyle(n.priority);
              const IconComp = typeConfig.icon;
              const timeFormatted = formatTimeOrMatchday(n);

              return (
                <div
                  key={idx}
                  className={`card p-4 rounded-xl transition-all duration-200 ${cardStyle}`}
                >
                  <div className="flex items-start gap-3.5">
                    {/* Icon Badge */}
                    <div className="shrink-0 pt-0.5">
                      <div className="w-10 h-10 rounded-xl bg-ccb-surface border border-ccb-border flex items-center justify-center text-xl shadow-inner">
                        <span>{typeConfig.emoji}</span>
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-white leading-snug">{n.title}</h3>
                          
                          {/* Type Badge */}
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${typeConfig.badgeStyle}`}
                          >
                            {typeConfig.badgeLabel}
                          </span>

                          {/* Priority Tag */}
                          {n.priority === 'high' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 uppercase tracking-wider">
                              HIGH
                            </span>
                          )}
                          {n.priority === 'medium' && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/40 uppercase tracking-wider">
                              MEDIUM
                            </span>
                          )}
                        </div>

                        {/* Timestamp */}
                        <div className="flex items-center gap-1 text-[11px] text-ccb-muted font-mono shrink-0">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{timeFormatted}</span>
                        </div>
                      </div>

                      {/* Message Body */}
                      <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{n.message}</p>

                      {/* Action Links */}
                      {n.fixtureId && (
                        <div className="pt-2 flex items-center gap-3">
                          <Link
                            href={`/league/match/${n.fixtureId}`}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ccb-primary hover:text-purple-300 transition-colors"
                          >
                            <Swords className="w-3.5 h-3.5" />
                            <span>View Match Fixture</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="card text-center py-12 px-4 border border-ccb-border rounded-xl bg-ccb-card space-y-3">
              <div className="w-12 h-12 rounded-full bg-ccb-surface border border-ccb-border mx-auto flex items-center justify-center text-slate-400">
                <Bell className="w-6 h-6 text-ccb-muted" />
              </div>
              <h3 className="text-base font-bold text-white">No notifications found</h3>
              <p className="text-xs text-ccb-muted max-w-xs mx-auto">
                {activeFilter !== 'all'
                  ? `No notifications match the "${activeFilter}" filter.`
                  : 'You have no league notifications at this time.'}
              </p>
              {activeFilter !== 'all' && (
                <button
                  onClick={() => setActiveFilter('all')}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-ccb-primary hover:underline pt-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
