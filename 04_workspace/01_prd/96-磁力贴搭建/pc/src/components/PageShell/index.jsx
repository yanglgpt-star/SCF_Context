export default function PageShell({ title, desc, actions, children }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="page-title">{title}</div>
          {desc && <div className="page-desc">{desc}</div>}
        </div>
        {actions}
      </div>
      {children}
    </div>
  )
}
