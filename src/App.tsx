import "./App.css";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";

type Job = {
  id: string;
  title: string;
  company: string;
  role?: string;
  description?: string;
  owner_id?: string;
};

type Candidate = {
  id: string;
  name: string;
  linkedin_url: string;
  status: CandidateStatus;
  job_id: string;
  owner_id?: string;
  description?: string;
  job_title?: string;
  cv_text?: string;
  ai_score?: number | null;
  ai_summary?: string | null;
};

type CustomerProfile = {
  id: string;
  email: string;
};

type CandidateStatus = "Applied" | "Interview" | "Offer";
type AccountRole = "admin" | "customer";

const statuses: CandidateStatus[] = ["Applied", "Interview", "Offer"];
const accountRoles: AccountRole[] = ["customer", "admin"];

function getUserRole(session: Session): AccountRole {
  const role =
    session.user.app_metadata?.role ?? session.user.user_metadata?.role;

  return normalizeAccountRole(role);
}

function normalizeAccountRole(role: unknown): AccountRole {
  return String(role ?? "")
    .trim()
    .toLowerCase() === "admin"
    ? "admin"
    : "customer";
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loadingSession) {
    return (
      <main className="loading-screen">
        <div className="loading-card">Loading workspace...</div>
      </main>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={session ? <Navigate to="/" replace /> : <LoginPage />}
      />
      <Route
        path="/"
        element={
          session ? (
            <Dashboard session={session} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setIsSubmitting(true);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setAuthError(error.message);
      return;
    }

    navigate("/", { replace: true });
  }

  async function resetPassword() {
    setAuthError("");
    setAuthNotice("");

    if (!email) {
      setAuthError("Enter your email first, then click reset password.");
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthNotice("Password reset email sent. Check your inbox.");
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-label="Login">
        <div className="brand-mark">ATS</div>
        <p className="eyebrow">Recruiting workspace</p>
        <h1>Mini ATS</h1>
        <p className="login-copy">
          Sign in to manage jobs, candidates, and hiring pipeline stages.
        </p>

        <form className="login-form" onSubmit={signIn}>
          <label>
            Email
            <input
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {authError && <p className="form-error">{authError}</p>}
          {authNotice && <p className="form-success">{authNotice}</p>}

          <button className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </button>
          <button className="text-button" type="button" onClick={resetPassword}>
            Forgot password?
          </button>
        </form>
      </section>
    </main>
  );
}

function Dashboard({ session }: { session: Session }) {
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateName, setCandidateName] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [status, setStatus] = useState<CandidateStatus>("Applied");
  const [search, setSearch] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [selectedJob, setSelectedJob] = useState("");
  const [message, setMessage] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [candidateDescription, setCandidateDescription] = useState("");
  const [profileRole, setProfileRole] = useState<AccountRole>(
    getUserRole(session),
  );
  const isAdmin = profileRole === "admin";
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [actingAsCustomerId, setActingAsCustomerId] = useState("");
  const [cvText, setCvText] = useState("");
  const [assessingCandidateId, setAssessingCandidateId] = useState<
    string | null
  >(null);

  useEffect(() => {
    async function fetchRole() {
      const { data: profileById, error: profileByIdError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profileByIdError) {
        setMessage(`Could not read profile role: ${profileByIdError.message}`);
        return;
      }

      if (profileById) {
        const nextRole = normalizeAccountRole(profileById.role);
        setProfileRole(nextRole);
        return;
      }

      if (!session.user.email) {
        return;
      }

      const { data: profileByEmail, error: profileByEmailError } =
        await supabase
          .from("profiles")
          .select("role")
          .eq("email", session.user.email)
          .maybeSingle();

      if (profileByEmailError) {
        setMessage(
          `Could not read profile role: ${profileByEmailError.message}`,
        );
        return;
      }

      if (profileByEmail) {
        const nextRole = normalizeAccountRole(profileByEmail.role);
        setProfileRole(nextRole);
      }
    }

    fetchRole();
  }, [session]);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let isMounted = true;

    supabase
      .from("profiles")
      .select("id, email")
      .eq("role", "customer")
      .order("email", { ascending: true })
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error) {
          setMessage(error.message);
          return;
        }

        setCustomers((data ?? []) as CustomerProfile[]);
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin]);

  async function fetchJobs(ownerId?: string) {
    let query = supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (ownerId) {
      query = query.eq("owner_id", ownerId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []) as Job[];
  }

  async function fetchCandidates(ownerId?: string) {
    let query = supabase
      .from("candidates")
      .select("*")
      .order("created_at", { ascending: false });

    if (ownerId) {
      query = query.eq("owner_id", ownerId);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return (data ?? []) as Candidate[];
  }

  useEffect(() => {
    if (isAdmin && !actingAsCustomerId) {
      return;
    }

    let isMounted = true;
    const ownerId = isAdmin ? actingAsCustomerId : undefined;

    Promise.all([fetchJobs(ownerId), fetchCandidates(ownerId)])
      .then(([nextJobs, nextCandidates]) => {
        if (!isMounted) {
          return;
        }

        setJobs(nextJobs);
        setCandidates(nextCandidates);
      })
      .catch((error: Error) => {
        if (isMounted) {
          setMessage(error.message);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAdmin, actingAsCustomerId]);

  async function addJob(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAdmin && !actingAsCustomerId) {
      setMessage("Select a customer to add a job for first.");
      return;
    }

    const ownerId = isAdmin ? actingAsCustomerId : undefined;

    const { error } = await supabase.from("jobs").insert([
      {
        title,
        company,
        role,
        description,
        ...(ownerId ? { owner_id: ownerId } : {}),
      },
    ]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setTitle("");
    setCompany("");
    setMessage("Job added.");
    setRole("");
    setDescription("");
    fetchJobs(ownerId)
      .then(setJobs)
      .catch((nextError: Error) => setMessage(nextError.message));
  }

  async function addCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isAdmin && !actingAsCustomerId) {
      setMessage("Select a customer to add a candidate for first.");
      return;
    }

    const ownerId = isAdmin ? actingAsCustomerId : undefined;
    const selectedJobData = jobs.find((job) => job.title === selectedJob);

    const { error } = await supabase.from("candidates").insert([
      {
        name: candidateName,
        linkedin_url: linkedinUrl,
        description: candidateDescription,
        status,
        job_id: selectedJobData?.id,
        cv_text: cvText,
        ...(ownerId ? { owner_id: ownerId } : {}),
      },
    ]);

    if (error) {
      setMessage(error.message);
      return;
    }

    setCandidateName("");
    setLinkedinUrl("");
    setStatus("Applied");
    setSelectedJob("");
    setMessage("Candidate added.");
    setCandidateDescription("");
    setCvText("");

    fetchCandidates(ownerId)
      .then(setCandidates)
      .catch((nextError: Error) => setMessage(nextError.message));
  }

  async function assessCandidate(candidateId: string) {
    setAssessingCandidateId(candidateId);
    setMessage("");

    const { data, error } = await supabase.functions.invoke(
      "assess-candidate",
      { body: { candidateId } },
    );

    setAssessingCandidateId(null);

    if (error) {
      let errorMessage = error.message;

      const context = (error as { context?: Response }).context;
      if (context) {
        try {
          const body = await context.json();
          if (body?.error) {
            errorMessage = body.error;
          }
        } catch {
          // ignore – fall back to error.message
        }
      }

      setMessage(errorMessage);
      return;
    }

    setCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, ai_score: data.score, ai_summary: data.summary }
          : candidate,
      ),
    );
    setMessage("AI assessment complete.");
  }

  async function updateCandidateStatus(
    candidateId: string,
    nextStatus: CandidateStatus,
  ) {
    const previousCandidates = candidates;

    setCandidates((currentCandidates) =>
      currentCandidates.map((candidate) =>
        candidate.id === candidateId
          ? { ...candidate, status: nextStatus }
          : candidate,
      ),
    );

    const { error } = await supabase
      .from("candidates")
      .update({ status: nextStatus })
      .eq("id", candidateId);

    if (error) {
      setCandidates(previousCandidates);
      setMessage(error.message);
      return;
    }

    setMessage("Candidate status updated.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  const filteredCandidates = useMemo(() => {
    return candidates
      .filter((candidate) =>
        candidate.name.toLowerCase().includes(search.toLowerCase()),
      )
      .filter((candidate) =>
        jobFilter ? candidate.job_id === jobFilter : true,
      );
  }, [candidates, jobFilter, search]);

  const jobById = useMemo(() => {
    return jobs.reduce<Record<string, Job>>((acc, job) => {
      acc[job.id] = job;
      return acc;
    }, {});
  }, [jobs]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Mini ATS</p>
          <h1>Hiring pipeline</h1>
        </div>
        <div className="topbar-actions">
          {isAdmin && (
            <select
              className="customer-switcher"
              value={actingAsCustomerId}
              onChange={(e) => setActingAsCustomerId(e.target.value)}
              aria-label="Act as customer"
            >
              <option value="">Select a customer...</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.email}
                </option>
              ))}
            </select>
          )}
          <span className="role-pill">{profileRole}</span>
          <span className="user-pill">{session.user.email}</span>
          <button className="ghost-button" onClick={signOut}>
            Logout
          </button>
        </div>
      </header>

      {isAdmin && <AdminPanel />}

      {isAdmin && !actingAsCustomerId ? (
        <section className="panel empty-state-panel">
          <p className="eyebrow">Act as customer</p>
          <h2>Select a customer to get started</h2>
          <p>
            Choose a customer from the dropdown above to view and manage
            their jobs and candidates.
          </p>
        </section>
      ) : (
        <>
          <section className="stats-grid" aria-label="Pipeline statistics">
        <StatCard label="Jobs" value={jobs.length} />
        <StatCard label="Candidates" value={candidates.length} />
        <StatCard
          label="Interviews"
          value={
            candidates.filter((candidate) => candidate.status === "Interview")
              .length
          }
        />
        <StatCard
          label="Offers"
          value={
            candidates.filter((candidate) => candidate.status === "Offer")
              .length
          }
        />
      </section>

      <section className="panel board-panel">
        <div className="panel-heading board-heading">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h2>Candidates</h2>
          </div>
          <div className="board-filters">
            <input
              className="search-input"
              type="text"
              placeholder="Search by candidate name"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="job-filter"
              value={jobFilter}
              onChange={(e) => setJobFilter(e.target.value)}
              aria-label="Filter candidates by job"
            >
              <option value="">All jobs</option>
              {jobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message && <p className="form-message">{message}</p>}

        <div className="kanban-board">
          {statuses.map((candidateStatus) => {
            const columnCandidates = filteredCandidates.filter(
              (candidate) => candidate.status === candidateStatus,
            );

            return (
              <div className="column" key={candidateStatus}>
                <div className="column-header">
                  <h3>{candidateStatus}</h3>
                  <span>{columnCandidates.length}</span>
                </div>

                <div className="candidate-list">
                  {columnCandidates.map((candidate) => {
                    const job = jobById[candidate.job_id];

                    return (
                      <article key={candidate.id} className="candidate-card">
                        <h4>{candidate.name}</h4>
                        {job ? (
                          <>
                            <p>
                              {job.title} at {job.company}
                            </p>

                            {job.role && <p>{job.role}</p>}
                          </>
                        ) : (
                          <p>No job selected</p>
                        )}
                        {candidate.description && (
                          <p>{candidate.description}</p>
                        )}
                        {candidate.linkedin_url && (
                          <a
                            href={candidate.linkedin_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            LinkedIn Profile
                          </a>
                        )}
                        {candidate.ai_score != null && (
                          <div className="ai-badge">
                            <span className="ai-score">
                              AI fit: {candidate.ai_score}/5
                            </span>
                            {candidate.ai_summary && (
                              <p className="ai-summary">
                                {candidate.ai_summary}
                              </p>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          className="ghost-button ai-assess-button"
                          disabled={assessingCandidateId === candidate.id}
                          onClick={() => assessCandidate(candidate.id)}
                        >
                          {assessingCandidateId === candidate.id
                            ? "Assessing..."
                            : candidate.ai_score != null
                              ? "Re-assess with AI"
                              : "Assess with AI"}
                        </button>
                        <select
                          className="status-select"
                          value={candidate.status}
                          onChange={(event) =>
                            updateCandidateStatus(
                              candidate.id,
                              event.target.value as CandidateStatus,
                            )
                          }
                          aria-label={`Status for ${candidate.name}`}
                        >
                          {statuses.map((candidateStatus) => (
                            <option
                              key={candidateStatus}
                              value={candidateStatus}
                            >
                              {candidateStatus}
                            </option>
                          ))}
                        </select>
                      </article>
                    );
                  })}

                  {columnCandidates.length === 0 && (
                    <p className="empty-state">No candidates</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Role setup</p>
              <h2>Add job</h2>
            </div>
          </div>

          <form className="stacked-form" onSubmit={addJob}>
            <input
              type="text"
              placeholder="Job title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />

            <input
              type="text"
              placeholder="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              required
            />

            <input
              type="text"
              placeholder="Job description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <button className="primary-button">Add Job</button>
          </form>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Candidate intake</p>
              <h2>Add candidate</h2>
            </div>
          </div>

          <form className="stacked-form" onSubmit={addCandidate}>
            <input
              type="text"
              placeholder="Candidate name"
              value={candidateName}
              onChange={(e) => setCandidateName(e.target.value)}
              required
            />
            <input
              type="url"
              placeholder="LinkedIn URL"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
            />
            <input
              type="text"
              placeholder="Candidate description"
              value={candidateDescription}
              onChange={(e) => setCandidateDescription(e.target.value)}
            />

            <textarea
              className="cv-textarea"
              placeholder="Paste CV text (optional, used for AI fit assessment)"
              value={cvText}
              onChange={(e) => setCvText(e.target.value)}
            />

            <div className="form-row">
              <input
                type="text"
                placeholder="Type or select job"
                list="jobs-list"
                value={selectedJob}
                onChange={(e) => setSelectedJob(e.target.value)}
              />

              <datalist id="jobs-list">
                {jobs.map((job) => (
                  <option key={job.id} value={job.title} />
                ))}
              </datalist>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CandidateStatus)}
              >
                {statuses.map((candidateStatus) => (
                  <option key={candidateStatus} value={candidateStatus}>
                    {candidateStatus}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary-button">Add Candidate</button>
          </form>
        </div>

        <section className="panel jobs-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">JOBS</p>
              <h2>Jobs</h2>
            </div>
          </div>

          <div className="jobs-list">
            {jobs.map((job) => (
              <div key={job.id} className="job-card">
                <strong>{job.title}</strong>
                <p>{job.company}</p>
                <span>{job.role}</span>
              </div>
            ))}
          </div>
        </section>
      </section>
        </>
      )}
    </main>
  );
}

function AdminPanel() {
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountRole, setAccountRole] = useState<AccountRole>("customer");
  const [accountMessage, setAccountMessage] = useState("");
  const [isCreatingAccount, setIsCreatingAccount] = useState(false);

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccountMessage("");
    setIsCreatingAccount(true);

    const { data, error } = await supabase.functions.invoke("create-user", {
      body: {
        email: accountEmail,
        password: accountPassword,
        role: accountRole,
      },
    });

    setIsCreatingAccount(false);

    if (error) {
      setAccountMessage(error.message);
      return;
    }

    setAccountEmail("");
    setAccountPassword("");
    setAccountRole("customer");
    setAccountMessage(`Created ${data.email} as ${data.role}.`);
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Create account</h2>
        </div>
      </div>

      <form className="admin-form" onSubmit={createAccount}>
        <input
          type="email"
          placeholder="User email"
          value={accountEmail}
          onChange={(event) => setAccountEmail(event.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Temporary password"
          value={accountPassword}
          onChange={(event) => setAccountPassword(event.target.value)}
          minLength={6}
          required
        />
        <select
          value={accountRole}
          onChange={(event) =>
            setAccountRole(event.target.value as AccountRole)
          }
        >
          {accountRoles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
        <button className="primary-button" disabled={isCreatingAccount}>
          {isCreatingAccount ? "Creating..." : "Create Account"}
        </button>
      </form>

      {accountMessage && (
        <p className="form-message admin-message">{accountMessage}</p>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
