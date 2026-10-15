---
name: semantic-html
description: >
  Semantic HTML and clean code standards: semantic elements over divs, IDs only when
  required, comments only where they add value.
  Trigger: When writing or reviewing HTML, JSX, or TSX markup.
---

# Semantic HTML & Clean Code Standards

**Regla obligatoria para todo el código generado.**

---

## Principios Fundamentales

### 1. HTML Semántico Obligatorio

| ❌ Evitar | ✅ Usar |
|-----------|---------|
| `<div>` para contenedores genéricos | `<header>`, `<main>`, `<section>`, `<article>`, `<aside>`, `<nav>`, `<footer>` |
| `<div class="wrapper">` | CSS Grid/Flex en el contenedor semántico |
| `<div class="card">` | `<article>` o `<section>` según contexto |
| `<div class="btn">` | `<button>` o `<a>` según acción |
| `<span class="heading">` | `<h1>`-`<h6>` según jerarquía |

### 2. IDs Solo Cuando Sean Necesarios

| ✅ Usar ID | ❌ No usar ID |
|------------|---------------|
| `htmlFor` en `<label>` | Estilos CSS (usar clases) |
| Anclas `#section` | Selectores JS (usar `data-testid` o `ref`) |
| ARIA `aria-labelledby` | Identificadores internos |

### 3. Comentarios: Solo Donde Aporten Valor

| ✅ Comentar | ❌ No comentar |
|-------------|----------------|
| Lógica compleja no obvia | Código autoexplicativo |
| Decisiones de arquitectura | Obviedades (`// render header`) |
| Workarounds / hacks temporales | Separadores (`// -----`) |
| Decisiones de negocio complejas | Finales de bloque obvios |

**Regla:** El código bien estructurado se explica solo. Si necesitas comentar qué hace el código, refactoréalo.

---

## Ejemplos de Refactoring

### ❌ Antes (No Semántico)
```tsx
<div id="header-wrapper">
  <div className="header">
    <div className="logo">Logo</div>
    <div className="nav">
      <div className="nav-item">Home</div>
    </div>
  </div>
</div>
```

### ✅ Después (Semántico)
```tsx
<header className="header">
  <div className="logo">Logo</div>
  <nav className="nav">
    <a href="/" className="nav-item">Home</a>
  </nav>
</header>
```

### ❌ Antes (Comentarios Innecesarios)
```tsx
// ===== Header Section =====
<header>
  // Logo
  <div className="logo">Logo</div>
  // Navigation
  <nav>...</nav>
  // ===== End Header =====
</header>
```

### ✅ Después (Sin Comentarios Innecesarios)
```tsx
<header>
  <div className="logo">Logo</div>
  <nav>...</nav>
</header>
```

---

## Checklist de Code Review

- [ ] ¿Todos los contenedores usan elementos semánticos?
- [ ] ¿No hay `id` innecesarios?
- [ ] ¿No hay comentarios separadores (`// -----`)?
- [ ] ¿Los comentarios explican *por qué*, no *qué*?
- [ ] ¿Jerarquía de headings correcta (`h1` → `h2` → `h3`)?
- [ ] ¿Formularios usan `<label htmlFor>` + `<input id>`?
- [ ] ¿Botones son `<button>` o `<a>` según acción?

---

## Aplicación Automática

Esta regla se aplica a **todo** el código generado:
- Nuevos archivos
- Refactorizaciones
- Correcciones de bugs
- Nuevas features

No hay excepciones. La semántica no es opcional.