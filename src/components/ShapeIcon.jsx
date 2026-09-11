export default function ShapeIcon({ shape, size = 28 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' }
  switch (shape) {
    case 'triangle':
      return (
        <svg {...common}><path d="M12 3 L22 20 L2 20 Z" /></svg>
      )
    case 'diamond':
      return (
        <svg {...common}><path d="M12 2 L22 12 L12 22 L2 12 Z" /></svg>
      )
    case 'circle':
      return (
        <svg {...common}><circle cx="12" cy="12" r="10" /></svg>
      )
    case 'square':
    default:
      return (
        <svg {...common}><rect x="3" y="3" width="18" height="18" rx="3" /></svg>
      )
  }
}
