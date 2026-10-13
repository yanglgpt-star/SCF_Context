/**
 * 未落地页面的占位。刻意写明「什么时候做、依赖什么、为什么这么排」，
 * 而不是放一句「敬请期待」——空页面要能说明自己为什么空。
 */
export default function Placeholder({ milestone, title, summary, bullets = [], deps = [] }) {
  return (
    <div className="placeholder">
      <span className="milestone">{milestone}</span>
      <h3>{title}</h3>
      <p>{summary}</p>
      {bullets.length > 0 && (
        <ul style={{ textAlign: 'left', fontSize: 12, lineHeight: 1.9, color: 'var(--ink-2)' }}>
          {bullets.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
      {deps.length > 0 && (
        <p className="faint" style={{ marginTop: 4 }}>
          依赖：{deps.join('　·　')}
        </p>
      )}
    </div>
  )
}
