import { loadRuntimeConfig } from "./config.js";

const HEADING_RE = /^(#{1,3})\s+(.+?)\s*$/;

/**
 * Split markdown into heading-sized chunks. Oversized sections are split on
 * blank lines so a single large doc does not become one embedding.
 */
export function chunkMarkdown(content, fallbackHeading) {
  const { maxChunkChars, minChunkChars } = loadRuntimeConfig();
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = {
    heading: fallbackHeading,
    startLine: 1,
    lines: [],
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = HEADING_RE.exec(line);
    if (match && current.lines.length > 0) {
      sections.push(current);
      current = {
        heading: stripHeadingMarks(match[2]),
        startLine: i + 1,
        lines: [line],
      };
      continue;
    }
    if (match && current.lines.length === 0) {
      current.heading = stripHeadingMarks(match[2]);
      current.startLine = i + 1;
    }
    current.lines.push(line);
  }
  if (current.lines.length > 0) {
    sections.push(current);
  }

  const chunks = [];
  for (const section of sections) {
    const text = section.lines.join("\n").trim();
    if (text.length < minChunkChars) {
      continue;
    }
    if (text.length <= maxChunkChars) {
      chunks.push({
        heading: section.heading,
        startLine: section.startLine,
        text,
      });
      continue;
    }
    chunks.push(...splitLongSection(section, maxChunkChars, minChunkChars));
  }
  return chunks;
}

function stripHeadingMarks(title) {
  return title.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
}

function splitLongSection(section, maxChunkChars, minChunkChars) {
  const out = [];
  const paragraphs = [];
  let buf = [];
  let bufStart = section.startLine;
  let lineNo = section.startLine;

  for (const line of section.lines) {
    if (line.trim() === "" && buf.length > 0) {
      paragraphs.push({
        startLine: bufStart,
        text: buf.join("\n"),
      });
      buf = [];
      bufStart = lineNo + 1;
    } else if (line.trim() !== "" || buf.length > 0) {
      if (buf.length === 0) {
        bufStart = lineNo;
      }
      buf.push(line);
    }
    lineNo += 1;
  }
  if (buf.length > 0) {
    paragraphs.push({ startLine: bufStart, text: buf.join("\n") });
  }

  let acc = [];
  let accStart = section.startLine;
  let accLen = 0;
  let part = 1;

  const flush = () => {
    const text = acc.join("\n\n").trim();
    if (text.length >= minChunkChars) {
      out.push({
        heading: part === 1 ? section.heading : `${section.heading} (${part})`,
        startLine: accStart,
        text: text.slice(0, maxChunkChars),
      });
      part += 1;
    }
    acc = [];
    accLen = 0;
  };

  for (const para of paragraphs) {
    if (acc.length === 0) {
      accStart = para.startLine;
    }
    if (accLen + para.text.length > maxChunkChars && acc.length > 0) {
      flush();
      accStart = para.startLine;
    }
    acc.push(para.text);
    accLen += para.text.length;
  }
  if (acc.length > 0) {
    flush();
  }
  return out;
}

export function extractSection(content, heading, fallbackHeading) {
  const chunks = chunkMarkdown(content, fallbackHeading);
  if (!heading) {
    return chunks[0] ?? null;
  }
  const exact = chunks.find((c) => c.heading === heading);
  if (exact) {
    return exact;
  }
  const needle = heading.toLowerCase();
  return (
    chunks.find((c) => c.heading.toLowerCase() === needle) ||
    chunks.find((c) => c.heading.toLowerCase().includes(needle)) ||
    null
  );
}

export function listHeadings(content, fallbackHeading) {
  return chunkMarkdown(content, fallbackHeading).map((c) => ({
    heading: c.heading,
    start_line: c.startLine,
  }));
}
