import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { visit } from "unist-util-visit";
import type { Node, Position } from "unist";
import type { Code, Paragraph, Parent, Text } from "mdast";
import { formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Remark plugin that disables indented code block syntax.
 * Converts indented code blocks (without language specifier) to plain text paragraphs,
 * while preserving fenced code blocks with backticks.
 */
export function disableIndentedCodeBlockPlugin() {
  return (tree: Node) => {
    visit(tree, "code", (node: Code, index, parent: Parent | undefined) => {
      // Convert indented code blocks (nodes without lang or meta property)
      // to plain text
      // Check if the parent exists so we can replace the node safely
      if (!node.lang && !node.meta && parent && typeof index === "number") {
        const nodePosition: Position | undefined = node.position;
        const textNode: Text = {
          type: "text",
          value: node.value,
          position: nodePosition,
        };
        const paragraphNode: Paragraph = {
          type: "paragraph",
          children: [textNode],
          position: nodePosition,
        };
        parent.children[index] = paragraphNode;
      }
    });
  };
}

export const renderDate = (dateString: string): string => {
  const date = new Date(dateString);
  return formatDistanceToNow(date, { addSuffix: true });
};

export const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};


