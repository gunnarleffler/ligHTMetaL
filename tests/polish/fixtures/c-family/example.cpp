#include <string>
template <typename T>
concept Sized = requires(T value) { value.size(); };
const auto text = u8R"polish(Quotes " and // stay in the raw string)polish";
constexpr unsigned long count = 1'000ULL;
std::string greet() {
  return "hello";
}
