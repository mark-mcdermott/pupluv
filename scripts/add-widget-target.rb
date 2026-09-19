# Creates the WidgetKit extension target and embeds it in the app. Idempotent.
require 'xcodeproj'

ROOT = File.expand_path('../iphone/App', __dir__)
# The target keeps its name — and so its bundle id — while its sources live in
# a plainly named folder.
NAME = 'PupluvWidget'
DIR = 'Widget'
TEAM = 'VRFF4MSHAC'

project = Xcodeproj::Project.open(File.join(ROOT, 'App.xcodeproj'))
app = project.targets.find { |t| t.name == 'App' } or abort 'App target not found'

widget = project.targets.find { |t| t.name == NAME }
if widget.nil?
  widget = project.new_target(:app_extension, NAME, :ios, '17.0')
  puts "created target #{NAME}"
else
  puts "target #{NAME} already present"
end

widget.build_configurations.each do |config|
  config.build_settings.merge!(
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.pupluv.app.PupluvWidget',
    'PRODUCT_NAME' => NAME,
    'INFOPLIST_FILE' => "#{DIR}/Info.plist",
    'GENERATE_INFOPLIST_FILE' => 'YES',
    'INFOPLIST_KEY_CFBundleDisplayName' => 'pupluv',
    'CODE_SIGN_ENTITLEMENTS' => "#{DIR}/#{NAME}.entitlements",
    'CODE_SIGN_STYLE' => 'Automatic',
    'DEVELOPMENT_TEAM' => TEAM,
    # Interactive widget buttons are App Intents, which need 17.
    'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'SKIP_INSTALL' => 'YES',
    'MARKETING_VERSION' => '1.0',
    'CURRENT_PROJECT_VERSION' => '1',
  )
end

# Sources: the widget's own files plus the model shared with the app.
group = project.main_group.find_subpath(DIR, true)
group.set_source_tree('SOURCE_ROOT')
group.set_path(DIR)

sources = Dir[File.join(ROOT, DIR, '*.swift')].sort.map do |file|
  name = File.basename(file)
  group.files.find { |f| f.display_name == name } || group.new_reference(name)
end

shared_group = project.main_group.find_subpath('Shared', true)
shared = Dir[File.join(ROOT, 'Shared', '*.swift')].sort.map do |file|
  name = File.basename(file)
  shared_group.files.find { |f| f.display_name == name } || shared_group.new_reference(name)
end

existing = widget.source_build_phase.files_references
(sources + shared).each do |ref|
  widget.add_file_references([ref]) unless existing.include?(ref)
end

# The artwork goes in as a folder reference rather than file by file, so a new
# glyph from `pnpm glyphs` is bundled without touching the project again.
glyphs_path = File.join(ROOT, DIR, 'Glyphs')
if Dir.exist?(glyphs_path)
  ref = group.files.find { |f| f.display_name == 'Glyphs' } ||
        group.new_reference('Glyphs').tap { |r| r.last_known_file_type = 'folder' }
  resources = widget.resources_build_phase
  resources.add_file_reference(ref) unless resources.files_references.include?(ref)
  puts 'resources: Glyphs/'
end

# The extension has to be copied into the app bundle's PlugIns directory, and
# re-signed on the way in, or it simply will not appear on the home screen.
embed = app.build_phases.find { |p|
  p.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) && p.name == 'Embed App Extensions'
}
if embed.nil?
  embed = app.new_copy_files_build_phase('Embed App Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
end
unless embed.files_references.include?(widget.product_reference)
  build_file = embed.add_file_reference(widget.product_reference)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

app.add_dependency(widget) unless app.dependencies.any? { |d| d.target == widget }

project.save
puts "sources: #{(sources + shared).map(&:display_name).join(', ')}"
puts "embedded into App, dependency added"
