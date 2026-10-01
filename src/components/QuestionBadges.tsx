import { Badge } from './ui'
import type { Categories } from '../lib/categories'

export function QuestionBadges({ scope, type, categories }: { scope: string; type: string; categories: Categories }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Badge className={categories.scopeColor(scope)}>{categories.scopeLabel(scope)}</Badge>
      <Badge className={categories.typeColor(type)}>{categories.typeLabel(type)}</Badge>
    </div>
  )
}
