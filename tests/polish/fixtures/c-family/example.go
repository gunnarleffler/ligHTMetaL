package main
import "fmt"
func main() {
  message := `raw \n
// still string content`
  letter := '界'
  count := 0x1.fp+2
  values := make([]int, 0)
  fmt.Println(message, letter, count, values)
}
