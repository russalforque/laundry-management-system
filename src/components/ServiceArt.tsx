import { Icon, serviceIcon } from './Icons'

/** Service photo: the uploaded image, or a soft blue tile with the service glyph when there is none. */
export function ServiceArt({ name, image, className, iconCls }: { name: string; image?: string | null; className: string; iconCls: string }) {
  if (image) return <img src={image} alt="" aria-hidden className={`object-cover ${className}`} />
  return (
    <span aria-hidden className={`grid place-items-center bg-linear-to-br from-blue-50 to-blue-100/70 text-blue-500 ${className}`}>
      <Icon className={iconCls}>{serviceIcon(name)}</Icon>
    </span>
  )
}
