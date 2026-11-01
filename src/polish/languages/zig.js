import { starter, quoted } from './shared/starter.js';
/** Zig starter; multiline literal lines use two leading backslashes. */
export default starter({
  id: 'zig', comments: [{ id: 'comment', pattern: /\/\/[^\r\n]*/, kind: 'comment' }],
  strings: [{ id: 'multiline-string', pattern: /\\\\[^\r\n]*/, kind: 'string' }, quoted('double', '"'), quoted('character', "'")],
  before: [{ id: 'builtin', pattern: /@[A-Za-z_]\w*/, kind: 'function' }],
  keywords: 'addrspace align allowzero and anyframe anytype asm async await break callconv catch comptime const continue defer else enum errdefer error export extern fn for if inline linksection noalias noinline nosuspend opaque or orelse packed pub resume return section struct suspend switch test threadlocal try union unreachable usingnamespace var volatile while',
  types: 'anyerror bool c_char c_int c_long c_longdouble c_longlong c_short c_uint c_ulong c_ulonglong c_ushort comptime_float comptime_int f16 f32 f64 f80 f128 isize noreturn type usize void', constants: 'null undefined', booleans: 'true false',
  after: [{ id: 'integer-type', pattern: /\b[ui]\d+\b/, kind: 'type' }],
});
