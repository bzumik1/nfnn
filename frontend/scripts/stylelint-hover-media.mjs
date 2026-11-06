import stylelint from 'stylelint';

export const ruleName = 'nfnn/hover-only-with-hover';

const messages = stylelint.utils.ruleMessages(ruleName, {
  outside: (selector) =>
    `"${selector}" must stand inside @media (hover: hover), so a tap on a touch screen leaves no sticky hover`,
});

const hoverPseudoClass = /:hover\b/;
const hoverQuery = /\(\s*hover\s*:\s*hover\s*\)/;

function insideHoverQuery(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === 'atrule' && parent.name === 'media' && hoverQuery.test(parent.params)) {
      return true;
    }
  }
  return false;
}

const rule = (enabled) => (root, result) => {
  if (!enabled) {
    return;
  }
  root.walkRules((node) => {
    if (hoverPseudoClass.test(node.selector) && !insideHoverQuery(node)) {
      stylelint.utils.report({
        ruleName,
        result,
        node,
        message: messages.outside(node.selector),
      });
    }
  });
};

rule.ruleName = ruleName;
rule.messages = messages;

export default stylelint.createPlugin(ruleName, rule);
