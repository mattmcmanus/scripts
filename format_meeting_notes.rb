#!/usr/bin/env ruby

def format_meeting_notes(input)
  # Split input into lines and remove empty lines
  lines = input.split("\n").reject(&:empty?)
  
  # Skip the first two lines (title and meta info)
  lines = lines[2..-1]
  
  # Initialize output array and current section
  output = []
  current_section = nil
  
  lines.each do |line|
    # Check if line is a section header (starts with ###)
    if line.start_with?('###')
      # Extract section name without ### and trim
      current_section = line.gsub(/^###\s*/, '').strip
      output << "- **#{current_section}**"
    # Skip the horizontal rule and chat link
    elsif line.start_with?('---') || line.include?('Chat with meeting transcript')
      next
    # Process list items
    elsif line.start_with?('-')
      # Add two spaces for nesting under the section
      output << "  #{line}"
    end
  end
  
  # Join all lines with newlines
  output.join("\n")
end

# Read from stdin and process
input = ARGF.read
puts format_meeting_notes(input) 