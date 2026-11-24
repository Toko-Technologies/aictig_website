/**
 * Team members, managed under "Team members" in the admin dashboard.
 * Loaded from /api/team; if the backend cannot be reached, the profiles in
 * shared/team.json (the original seed data) are shown instead.
 */
import { useEffect, useState } from 'react';
import seedTeam from '../../shared/team.json';

export interface TeamMember {
  /** URL part of the profile page: /experts/:slug */
  slug: string;
  name: string;
  role: string;
  /** Image URL (/team/... for original photos, /uploads/... for uploaded ones). */
  photo: string;
  /** One-line summary for team cards and search engines. */
  summary: string;
  email?: string;
  linkedin?: string;
  googleScholar?: string;
  /** Paragraphs; inline Markdown links and *italics* are allowed. */
  bio: string[];
  expertise: string[];
  regionalFocus?: string[];
  projects?: string[];
  publications?: string[];
  conferences?: string[];
}

let request: Promise<TeamMember[]> | null = null;

export function fetchTeam(): Promise<TeamMember[]> {
  if (!request) {
    request = fetch('/api/team')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .catch(() => seedTeam as TeamMember[]);
  }
  return request;
}

/** The team list, or null while it is loading. */
export function useTeam(): TeamMember[] | null {
  const [team, setTeam] = useState<TeamMember[] | null>(null);
  useEffect(() => {
    let active = true;
    fetchTeam().then((members) => {
      if (active) setTeam(members);
    });
    return () => {
      active = false;
    };
  }, []);
  return team;
}
