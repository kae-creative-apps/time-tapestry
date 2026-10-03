"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminNav } from "@/components/AdminNav";

type SessionSummary = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  initiationPath: string;
  grandparentName: string;
  grandchildName: string;
  familyName: string;
  interviewStartedAt?: string;
  interviewCompletedAt?: string;
  storyApprovedAt?: string;
  postcardsScheduledCount: number;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    fetch("/api/admin/sessions")
      .then((res) => {
        if (res.status === 401) {
          router.push("/admin/login?redirect=/admin");
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && "sessions" in data) {
          setSessions(data.sessions);
        } else if (data && "error" in data) {
          setError(data.error);
        }
      })
      .catch(() => setError("Failed to load sessions"))
      .finally(() => setLoading(false));
  }, [router]);

  const filteredSessions = useMemo(() => {
    const q = filter.toLowerCase();
    return sessions.filter((s) => {
      const matchesText =
        !q ||
        s.grandparentName.toLowerCase().includes(q) ||
        s.grandchildName.toLowerCase().includes(q) ||
        s.familyName.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q);
      const matchesStatus = !statusFilter || s.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [sessions, filter, statusFilter]);

  const stats = useMemo(() => {
    const total = sessions.length;
    const interviewsStarted = sessions.filter(
      (s) => s.interviewStartedAt,
    ).length;
    const interviewsCompleted = sessions.filter(
      (s) => s.interviewCompletedAt,
    ).length;
    const storiesApproved = sessions.filter((s) => s.storyApprovedAt).length;
    const postcardsSent = sessions.reduce(
      (sum, s) => sum + s.postcardsScheduledCount,
      0,
    );
    return {
      total,
      interviewsStarted,
      interviewsCompleted,
      storiesApproved,
      postcardsSent,
    };
  }, [sessions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-paper-texture">
        <AdminNav />
        <p className="mx-auto max-w-6xl px-6 pt-5 text-sm text-ink-500">
          Archived prototype records. Current collections are managed through
          their storyteller links.
        </p>
        <main className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-ink-500">Loading sessions...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper-texture">
      <AdminNav />
      <p className="mx-auto max-w-6xl px-6 pt-5 text-sm text-ink-500">
        Archived prototype records. Current collections are managed through
        their storyteller links.
      </p>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl text-ink">Admin dashboard</h1>
            <p className="font-sans text-sm text-ink-500">
              View all sessions, stories, and postcards.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search by name or ID"
              className="w-full sm:w-64"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full sm:w-44"
            >
              <option value="">All statuses</option>
              <option value="created">Created</option>
              <option value="interview_started">Interview started</option>
              <option value="interview_complete">Interview complete</option>
              <option value="approved">Approved</option>
              <option value="delivered">Delivered</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-oxblood-400 bg-oxblood-50 p-4 text-oxblood">
            {error}
          </div>
        )}

        <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard label="Total sessions" value={stats.total} />
          <StatCard
            label="Interviews started"
            value={stats.interviewsStarted}
          />
          <StatCard
            label="Interviews completed"
            value={stats.interviewsCompleted}
          />
          <StatCard label="Stories approved" value={stats.storiesApproved} />
          <StatCard label="Postcards scheduled" value={stats.postcardsSent} />
        </div>

        <div className="overflow-x-auto rounded-lg border border-warmgray-300 bg-paper-50">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead className="border-b border-warmgray-300 bg-paper-200">
              <tr>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Created
                </th>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Grandparent
                </th>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Grandchild
                </th>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Status
                </th>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Path
                </th>
                <th className="px-4 py-3 font-sans font-medium text-ink-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-ink-400"
                  >
                    No sessions found.
                  </td>
                </tr>
              )}
              {filteredSessions.map((session) => (
                <tr
                  key={session.id}
                  className="border-b border-warmgray-200 last:border-b-0 hover:bg-paper-100"
                >
                  <td className="px-4 py-3 text-ink-600">
                    {formatDate(session.createdAt)}
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">
                    {session.grandparentName || "Not supplied"}
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {session.grandchildName || "Not supplied"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={session.status} />
                  </td>
                  <td className="px-4 py-3 text-ink-600">
                    {session.initiationPath || "Not supplied"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/session/${session.id}`}
                        className="rounded bg-oxblood px-3 py-1 text-xs font-medium text-paper hover:bg-oxblood-600"
                      >
                        Details
                      </Link>
                      <Link
                        href={`/keepsake/${session.id}`}
                        className="rounded border border-oxblood px-3 py-1 text-xs font-medium text-oxblood hover:bg-oxblood-700/10"
                      >
                        Keepsake
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-warmgray-300 bg-paper-50 p-4 text-center">
      <p className="font-serif text-2xl text-oxblood">{value}</p>
      <p className="font-sans text-xs uppercase tracking-wide text-ink-500">
        {label}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "approved" || status === "delivered"
      ? "bg-forest/10 text-forest"
      : status === "interview_complete"
        ? "bg-oxblood/10 text-oxblood"
        : status === "interview_started"
          ? "bg-amber-100 text-amber-800"
          : "bg-warmgray-200 text-ink-500";

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "Not supplied";
  const date = new Date(iso);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
