# Command Palette - Vercel-Style UI

A beautiful, modern command palette component with Vercel-inspired design, keyboard navigation, and smooth animations.

## Features

- ✨ **Vercel-style design** - Clean, modern UI with subtle gradients and smooth transitions
- ⌨️ **Full keyboard navigation** - Arrow keys, Enter, and ESC support
- 🔍 **Fuzzy search** - Search across commands, descriptions, and keywords
- 📦 **Grouped commands** - Organized sections for better discoverability
- 🎨 **Theme integration** - Built-in theme switching commands
- 🚀 **Smooth animations** - Polished interactions and transitions
- 📱 **Responsive** - Works on all screen sizes

## Usage

### Basic Usage

```tsx
import { useCommandPalette } from "@/components/CommandPalette";

export default function MyApp() {
  const { open, setOpen } = useCommandPalette();

  return (
    <div>
      {/* Your app content */}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
```

### Manual Control

```tsx
import CommandPalette from "@/components/CommandPalette";
import { useState } from "react";

export default function MyApp() {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setOpen(true)}>Open Command Palette</button>
      <CommandPalette open={open} onOpenChange={setOpen} />
    </div>
  );
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl/Cmd + K` | Toggle command palette |
| `↑` / `↓` | Navigate commands |
| `Enter` | Execute selected command |
| `ESC` | Close palette |

## Customization

### Adding Custom Commands

Edit the `commands` array in `CommandPalette.tsx`:

```tsx
const commands: CommandItem[] = useMemo(
  () => [
    {
      id: "my-command",
      label: "My Custom Command",
      description: "Does something awesome",
      icon: <Sparkles className="h-4 w-4" />,
      onSelect: () => {
        // Your custom action
        console.log("Custom command executed");
        onOpenChange(false);
      },
      keywords: ["custom", "awesome"],
      section: "Custom",
    },
    // ... other commands
  ],
  [onOpenChange]
);
```

### Styling

The component uses Tailwind CSS and follows the shadcn/ui design system. You can customize colors by updating your `globals.css`:

```css
:root {
  --primary: oklch(...); /* Your primary color */
  --muted: oklch(...);   /* Your muted color */
  /* ... other CSS variables */
}
```

## Integration Examples

### With Navigation

```tsx
import { useRouter } from "next/navigation";

// In your commands array:
{
  id: "go-to-dashboard",
  label: "Dashboard",
  icon: <Home className="h-4 w-4" />,
  onSelect: () => {
    router.push("/dashboard");
    onOpenChange(false);
  },
  section: "Navigation",
}
```

### With Actions

```tsx
// In your commands array:
{
  id: "export-data",
  label: "Export Data",
  icon: <Download className="h-4 w-4" />,
  onSelect: async () => {
    await exportUserData();
    onOpenChange(false);
    toast.success("Data exported!");
  },
  section: "Actions",
}
```

## Design Choices

### Vercel-Style Elements

1. **Backdrop blur** - Subtle background blur for depth
2. **Gradient accents** - Soft gradients on selected items
3. **Monospace indicators** - Keyboard shortcuts in mono font
4. **Icon backgrounds** - Colored backgrounds for command icons
5. **Section dividers** - Clean horizontal dividers with labels
6. **Subtle animations** - Smooth transitions and hover effects

### Color Palette

The component uses semantic color tokens:
- `primary` - Accent color for selected items
- `muted` - Background for inputs and cards
- `border` - Borders and dividers
- `foreground` - Text color

## Accessibility

- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Screen reader support
- ✅ Semantic HTML
- ✅ ARIA attributes (via Radix UI)

## Performance

- Memoized command filtering
- Virtualized scrolling (via ScrollArea)
- Debounced search
- Minimal re-renders

## Dependencies

- `lucide-react` - Icons
- `next-themes` - Theme management
- `@radix-ui/react-dialog` - Dialog component
- `tailwindcss` - Styling

## Demo

See `CommandPaletteDemo.tsx` for a complete example with all features showcased.

## Tips

1. **Group related commands** - Use sections to organize commands logically
2. **Add keywords** - Include synonyms and related terms for better search
3. **Keep it accessible** - Always close the dialog after executing a command
4. **Use good icons** - Choose clear, recognizable icons from lucide-react
5. **Test keyboard nav** - Ensure all commands are reachable via keyboard

## Screenshots

The command palette features:
- Clean search input with icon
- Grouped command sections
- Hover and selected states with subtle animations
- Keyboard shortcut hints
- Empty state for no results
- Footer with navigation tips
