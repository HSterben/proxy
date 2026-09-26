/**
 * Circular avatar with image or initials fallback (matches website ProfileAvatar).
 */
export default function AccountAvatar({
  name = 'Account',
  src = null,
  size = 32,
  className = '',
}) {
  const initial = (String(name || '?').trim()[0] || '?').toUpperCase();
  const dim = typeof size === 'number' ? `${size}px` : size;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`account-avatar account-avatar-img ${className}`.trim()}
        style={{ width: dim, height: dim }}
        draggable={false}
      />
    );
  }

  return (
    <span
      className={`account-avatar account-avatar-fallback ${className}`.trim()}
      style={{ width: dim, height: dim, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
