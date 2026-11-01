import c from './c.js';
import { composeLanguage } from '../compose.js';
/** Objective-C starter; message sends are not semantically parsed. */
export default composeLanguage(c, {
  id: 'objective-c', aliases: ['objc'], edits: [
    { op: 'insertBefore', target: 'quotes', rules: [{ id: 'objc-string', begin: /@"/, end: /"|(?=\r|\n)/, kind: 'string', rules: [{ id: 'escape', pattern: /\\[^]/, kind: 'string' }] }] },
    { op: 'insertBefore', target: 'keyword', rules: [
      { id: 'objc-keyword', pattern: /@(?:interface|implementation|end|protocol|property|synthesize|dynamic|class|public|private|protected|package|selector|encode|defs|try|catch|finally|throw|synchronized|autoreleasepool|optional|required|available)\b/, kind: 'keyword' },
      { id: 'objc-type', pattern: /\b(?:id|instancetype|Class|SEL|BOOL|NSInteger|NSUInteger|CGFloat|NSString|NSObject)\b/, kind: 'type' },
      { id: 'objc-constant', pattern: /\b(?:nil|Nil|YES|NO)\b/, kind: 'constant' },
    ] },
  ],
});
