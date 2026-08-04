import { Bell, BookOpen, Check, ChevronRight, ClipboardCheck, FileVideo, LogOut, Menu, UserRound } from 'lucide-react'
import { Link } from '../router'
import ThemeToggle from '../components/ThemeToggle'

const stages = [
  ['Application', 'Completed', true],
  ['Profile Review', 'Completed', true],
  ['Online Training', 'In progress', false],
  ['Assessment', 'Locked', false],
  ['Final Review', 'Pending', false],
]

export default function Dashboard() {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="brand brand-light">NEXA<span>MODEL</span></div>
        <nav>
          <a className="active" href="#overview"><UserRound size={18} /> Overview</a>
          <a href="#training"><BookOpen size={18} /> Training</a>
          <a href="#assessment"><ClipboardCheck size={18} /> Assessment</a>
          <a href="#documents"><FileVideo size={18} /> Submissions</a>
        </nav>
        <Link to="/"><LogOut size={18} /> Sign out</Link>
      </aside>

      <main className="dashboard-main">
        <header className="dashboard-header">
          <button aria-label="Open menu"><Menu /></button>
          <div><ThemeToggle /><Bell size={20} /><div className="avatar">NA</div></div>
        </header>

        <section className="dashboard-content" id="overview">
          <p className="section-label">TALENT PORTAL</p>
          <h1>Good evening, Nadia.</h1>
          <p className="muted">Here is what you need to complete next.</p>

          <div className="dashboard-grid">
            <article className="progress-card">
              <div className="card-heading"><div><span>CURRENT PROGRESS</span><h2>60% complete</h2></div><strong>3/5</strong></div>
              <div className="progress-bar"><div style={{ width: '60%' }} /></div>
              <div className="stage-list">
                {stages.map(([name, status, complete]) => (
                  <div className="stage-row" key={name}>
                    <span className={complete ? 'stage-check complete' : 'stage-check'}>{complete ? <Check size={14} /> : ''}</span>
                    <div><strong>{name}</strong><small>{status}</small></div>
                    <ChevronRight size={17} />
                  </div>
                ))}
              </div>
            </article>

            <div className="dashboard-side">
              <article className="next-card">
                <span>NEXT ACTION</span>
                <h2>Complete Module 3</h2>
                <p>Camera confidence and activewear movement basics.</p>
                <div className="deadline">Due 8 August 2026</div>
                <button className="button button-light full-button">Continue training <ArrowRightIcon /></button>
              </article>
              <article className="profile-card">
                <div><span>PROFILE COMPLETION</span><strong>85%</strong></div>
                <div className="progress-bar small"><div style={{ width: '85%' }} /></div>
                <a href="#profile">Complete your measurements <ChevronRight size={16} /></a>
              </article>
            </div>
          </div>

          <section className="submission-panel" id="assessment">
            <div><p className="section-label">VIDEO ASSESSMENT</p><h2>Assessment submission</h2><p>Your upload link will be unlocked after all training modules are complete.</p></div>
            <button className="button disabled-button" disabled><LockKeyholeIcon /> Upload locked</button>
          </section>
        </section>
      </main>
    </div>
  )
}

function ArrowRightIcon() { return <ChevronRight size={17} /> }
function LockKeyholeIcon() { return <span aria-hidden="true">🔒</span> }
