---
description: UI component conventions, patterns, and naming rules for ClickPar's frontend
---

# Component Conventions — ClickPar

## Tech Stack
- **Framework**: Next.js 16+ (App Router)
- **Styling**: Tailwind CSS 4
- **Components**: Shadcn/UI (Radix primitives)
- **Icons**: Lucide React
- **Toasts**: Sonner
- **Theme**: Dark mode priority (`next-themes`)

## Visual Identity

| Token | Value | Usage |
|-------|-------|-------|
| Dark BG | `#1a1a1a` | Base background |
| Primary Green | `#86EFAC` | Success, accents |
| Warning Orange | `#F97316` | Alerts, warnings |
| Borders | Tailwind `border` / `muted-foreground` | Dividers, cards |

## File Structure

```
app/(dashboard)/[section]/page.tsx    → Server Component (data fetching)
components/[section]/[component].tsx  → Client Components (interactive)
lib/actions/[domain].ts               → Server Actions
lib/supabase/server.ts                → Admin client
lib/supabase/client.ts                → Browser client
types/                                → TypeScript interfaces
```

## Standard Imports Pattern

```typescript
'use client';

// Shadcn UI
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

// Icons
import { Plus, Search, Trash2, Edit, Download } from 'lucide-react';

// Toasts
import { toast } from 'sonner';

// Data fetching in client components
import { createClient } from '@/lib/supabase/client';
```

## Component Patterns

### Page Layout (Server Component)
```typescript
// app/(dashboard)/section/page.tsx
import { createAdminClient } from '@/lib/supabase/server';

export default async function SectionPage() {
  const supabase = await createAdminClient();
  const [data1, data2] = await Promise.all([
    supabase.from('table1').select('*'),
    supabase.from('table2').select('*'),
  ]);
  
  return <SectionClient data={data1.data} />;
}
```

### Modal Pattern
```typescript
// Always use Dialog from Shadcn
<Dialog open={isOpen} onOpenChange={setIsOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>Título</DialogTitle>
    </DialogHeader>
    {/* Form content */}
  </DialogContent>
</Dialog>
```

### Table with Filters
```typescript
// Standard pattern: search input + filter badges + data table
const [search, setSearch] = useState('');
const [filter, setFilter] = useState('all');

const filtered = useMemo(() => 
  data.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) &&
    (filter === 'all' || item.status === filter)
  ), [data, search, filter]);
```

### Loading States
- **Full page**: Skeleton components
- **Buttons**: `disabled` + spinner text ("Guardando...")
- **Data refresh**: `window.location.reload()` after mutations (for full state sync)

### Toast Notifications
```typescript
// Success
toast.success('Operación exitosa');

// Error  
toast.error('Error al guardar');

// With description
toast.success('Venta registrada', { description: 'Netflix - Perfil 1' });
```

## Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Page files | `page.tsx` in route dirs | `app/(dashboard)/inventory/page.tsx` |
| Components | PascalCase | `QuickSaleWidget.tsx` |
| Server actions | camelCase functions | `createQuickSale()` |
| UI labels | Spanish | "Guardar", "Cancelar", "Buscar" |
| DB columns | snake_case | `full_name`, `is_active` |

## Common Pitfalls

1. **Slot labeling**: Always use `slot_identifier` (not `profile_name` or `slot_number`)
2. **Platform overflow**: Grid containers need `overflow-y-auto` + `max-h-48`
3. **Phone fields**: `customers.phone` vs `profiles.phone_number` — check the table
4. **Auth protection**: Done at `app/(dashboard)/layout.tsx` level, not middleware
5. **Date formatting**: Use `date-fns` for Paraguay timezone displays
