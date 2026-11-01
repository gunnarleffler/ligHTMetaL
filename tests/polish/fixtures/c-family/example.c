#include <stdio.h>
#define VALUE \
  42
// ordinary C comment
const char *message = "hello // not a comment";
unsigned long count = 0x2aUL;
int main(void) {
  printf("%s", message);
  return 0;
}
