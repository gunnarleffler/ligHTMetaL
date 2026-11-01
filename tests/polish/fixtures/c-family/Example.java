@Override
public String describe() {
  var text = """
      // not a comment
      "quotes" stay inside this text block
      """;
  long count = 1_000L;
  boolean enabled = true;
  return text;
}
