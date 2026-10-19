"""Bounded documentation index. Content is data, never executable HTML or commands."""
import posixpath
import re
from urllib.parse import unquote, urlsplit
from app.models.schema import Analysis


def documentation(analysis: Analysis, focus: str = ""):
    files = {f.path: f for f in analysis.files}
    symbols = [n for n in analysis.nodes if n.kind in {"Function", "Method", "Class", "Module"}]
    by_name: dict[str, list] = {}
    for n in symbols:
        for name in {n.name, n.qualified_name}:
            by_name.setdefault(name, []).append(n)
    docs: list[dict] = []
    reference_budget = 500
    remaining = 200_000
    paths = sorted((p for p in files if p.lower().endswith((".md", ".markdown"))), key=lambda p: (p != focus, p.lower() != "readme.md", p.count("/"), p))
    truncated = len(paths) > 40
    for path in paths[:40]:
        if remaining <= 0:
            truncated = True
            break
        source = files[path].source[:min(50_000, remaining)]
        remaining -= len(source)
        truncated |= len(source) < len(files[path].source)
        sections: list[dict] = []
        current: dict = {"id": "codemotion-preamble", "title": path, "level": 1, "line": 1, "body": [], "references": []}
        sections.append(current)
        slugs: dict[str, int] = {"codemotion-preamble": 1}
        fence = ""
        for line, text in enumerate(source.splitlines(), 1):
            marker = re.match(r"^\s*(`{3,}|~{3,})", text)
            if marker:
                if not fence:
                    fence = marker[1][0]
                elif marker[1][0] == fence:
                    fence = ""
            heading = re.match(r"^(#{1,6})\s+(.+?)\s*#*\s*$", text) if not fence else None
            if heading and len(sections) >= 200:
                truncated = True
            if heading and len(sections) < 200:
                title = heading[2]
                slug = re.sub(r"[^\w\s-]", "", title.lower()).replace(" ", "-") or "section"
                count = slugs.get(slug, 0)
                slugs[slug] = count + 1
                current = {"id": slug + (f"-{count}" if count else ""), "title": title, "level": len(heading[1]), "line": line, "body": [], "references": []}
                sections.append(current)
                continue
            current["body"].append(text)
        for section in sections:
            body = "\n".join(section["body"])
            section["body"] = body
            references = []
            links = list(re.finditer(r"(?<!!)\[([^]\n]+)\]\(([^\s)]+)\)", body))
            truncated |= len(links) > 100
            for match in links[:100]:
                label, href = match.groups()
                ref: dict = {"label": label, "text": match[0], "evidence": "Lien explicite", "targets": [], "path": None, "line": 1, "anchor": ""}
                try:
                    url = urlsplit(href)
                except ValueError:
                    ref["status"] = "blocked"
                    references.append(ref)
                    continue
                if url.scheme or url.netloc:
                    ref.update(status="external" if url.scheme in {"http", "https"} and url.netloc else "blocked", href=href)
                else:
                    target = posixpath.normpath(posixpath.join(posixpath.dirname(path), unquote(url.path))) if url.path else path
                    fragment = unquote(url.fragment)
                    lines = re.fullmatch(r"L([1-9][0-9]{0,8})(?:-L?([1-9][0-9]{0,8}))?", fragment)
                    safe = not target.startswith(("../", "/")) and target != ".." and "\\" not in target and ":" not in target
                    if not safe:
                        ref["status"] = "blocked"
                    elif target in files:
                        line = int(lines[1]) if lines else 1
                        valid_line = line <= max(1, len(files[target].source.splitlines()))
                        ref.update(status="file" if valid_line else "missing", path=target, line=line, anchor=fragment if not lines else "")
                        if not target.lower().endswith((".md", ".markdown")):
                            ref["targets"] = [n for n in symbols if n.source and n.source.file == target and n.kind == "Module"]
                    elif any(f.startswith(target.rstrip("/") + "/") for f in files):
                        ref.update(status="directory", path=target.rstrip("/"))
                    else:
                        ref.update(status="missing", path=target)
                references.append(ref)
            tokens = [(m[1], m[0], "Symbole identifié") for m in re.finditer(r"`([\w.]+)(?:\(\))?`", body)]
            for match in re.finditer(r"\bpython(?:3)?\s+(?:(-m)\s+)?([\w./-]+)", body):
                token = match[2]
                target = token.replace(".", "/") + ".py" if match[1] else token
                if target in files:
                    references.append({"label": match[0], "text": match[0], "evidence": "Point d’entrée documenté (non exécuté)", "status": "file", "path": target, "line": 1, "anchor": "", "targets": []})
            truncated |= len(tokens) > 100
            for token, text, evidence in tokens[:100]:
                candidates = by_name.get(token, [])
                if not candidates and "." in token:
                    candidates = [n for n in symbols if n.qualified_name.endswith("." + token)]
                references.append({"label": token, "text": text, "evidence": evidence if candidates else "Mention de code à vérifier", "status": "symbol" if candidates else "missing", "path": None, "line": 1, "anchor": "", "targets": candidates[:30], "truncated": len(candidates) > 30})
            seen: set[str] = set()
            section["references"] = []
            for ref in sorted(references, key=lambda r: body.find(r["text"])):
                if ref["text"] in seen:
                    continue
                seen.add(ref["text"])
                if reference_budget <= 0 or len(section["references"]) >= 200:
                    truncated = True
                    continue
                section["references"].append(ref)
                reference_budget -= 1
        if len(sections) > 1 and not sections[0]["body"].strip():
            sections = sections[1:]
        docs.append({"path": path, "sections": sections})
    # Validate local Markdown anchors after headings are indexed.
    anchors = {d["path"]: {s["id"] for s in d["sections"]} for d in docs}
    for doc in docs:
        for section in doc["sections"]:
            for ref in section["references"]:
                if ref.get("anchor") and ref.get("path") in anchors and ref["anchor"] not in anchors[ref["path"]]:
                    ref["status"] = "missing"
    return {"available": sorted(paths), "documents": docs, "truncated": truncated, "limitation": "Markdown simplifié : titres ATX, liens inline, noms en code et commandes python. HTML affiché comme texte ; images non chargées. Liens de référence et ancres HTML non interprétés. Une mention ne prouve pas un appel."}


def compare_documentation_versions(current_analysis: Analysis, previous_analysis: Analysis):
    current = documentation(current_analysis)
    previous = documentation(previous_analysis)
    references = {(d["path"], r["text"]): r for d in current["documents"] for section in d["sections"] for r in section["references"]}
    changes = []
    for doc in previous["documents"]:
        for section in doc["sections"]:
            for ref in section["references"]:
                if ref["status"] not in {"file", "symbol", "directory"}:
                    continue
                found = references.get((doc["path"], ref["text"]))
                if found is None or found["status"] in {"missing", "blocked"}:
                    changes.append({"document": doc["path"], "label": ref["label"], "status": "removed" if found is None else "invalid"})
                elif {(t.qualified_name, str(t.source)) for t in ref["targets"]} != {(t.qualified_name, str(t.source)) for t in found["targets"]}:
                    changes.append({"document": doc["path"], "label": ref["label"], "status": "changed"})
    return {"changes": changes, "truncated": current["truncated"] or previous["truncated"]}
