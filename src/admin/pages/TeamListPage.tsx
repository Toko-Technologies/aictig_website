import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownIcon,
  ArrowTopRightOnSquareIcon,
  ArrowUpIcon,
  PencilSquareIcon,
  PlusIcon,
} from '@heroicons/react/24/outline';
import { api, type AdminTeamMember } from '../api';
import { useToast } from '../session';
import { Alert, Badge, Button, Card, EmptyState, LoadingState, PageHeader } from '../ui';

function Avatar({ member }: { member: AdminTeamMember }) {
  if (member.photo) {
    return <img src={member.photo} alt="" className="h-12 w-12 flex-shrink-0 rounded-full object-cover object-top bg-neutral-100" />;
  }
  const initials = member.name.replace(/^(dr|prof|mr|mrs|ms)\.?\s+/i, '').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return (
    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
      {initials}
    </span>
  );
}

export default function TeamListPage() {
  const [members, setMembers] = useState<AdminTeamMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const notify = useToast();

  useEffect(() => {
    api.get<AdminTeamMember[]>('/team').then(setMembers).catch((e) => setError(e.message));
  }, []);

  const move = async (index: number, direction: -1 | 1) => {
    if (!members) return;
    const next = [...members];
    const [item] = next.splice(index, 1);
    next.splice(index + direction, 0, item);
    setMembers(next);
    setMoving(true);
    try {
      setMembers(await api.put<AdminTeamMember[]>('/team-order', { ids: next.map((m) => m.id) }));
      notify('success', 'Order saved. The About page shows the team in this order.');
    } catch (e) {
      setMembers(members);
      notify('error', e instanceof Error ? e.message : 'Could not change the order.');
    } finally {
      setMoving(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Team members"
        description="The experts shown in the “Our Team” section of the About page. Each one also has their own profile page."
        actions={
          <Link
            to="/admin/team/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add team member
          </Link>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!members && !error && <LoadingState />}

      {members && (
        <Card>
          {members.length === 0 ? (
            <EmptyState
              title="No team members yet"
              description="Add the first person to show them on the About page."
            />
          ) : (
            <ul className="-my-5 divide-y divide-neutral-100">
              {members.map((member, index) => (
                <li key={member.id} className="flex flex-wrap items-center gap-4 py-4 sm:flex-nowrap">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!p-1"
                      disabled={index === 0 || moving}
                      onClick={() => move(index, -1)}
                      aria-label={`Move ${member.name} up`}
                      icon={<ArrowUpIcon className="h-4 w-4" />}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="!p-1"
                      disabled={index === members.length - 1 || moving}
                      onClick={() => move(index, 1)}
                      aria-label={`Move ${member.name} down`}
                      icon={<ArrowDownIcon className="h-4 w-4" />}
                    />
                  </div>
                  <Avatar member={member} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-neutral-900">
                      {member.name}
                      {member.published ? <Badge tone="green">Visible</Badge> : <Badge>Hidden</Badge>}
                    </p>
                    <p className="text-sm text-neutral-500">{member.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {member.published && (
                      <a
                        href={`/experts/${member.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-secondary-600 hover:bg-secondary-50"
                      >
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                        View
                      </a>
                    )}
                    <Link
                      to={`/admin/team/${member.id}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 shadow-sm hover:bg-neutral-50"
                    >
                      <PencilSquareIcon className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
