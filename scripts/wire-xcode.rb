# Wires the shared Swift sources and the App Group entitlement into the app
# target. Idempotent: running it twice changes nothing.
require 'xcodeproj'

ROOT = File.expand_path('../iphone/App', __dir__)
project = Xcodeproj::Project.open(File.join(ROOT, 'App.xcodeproj'))
app = project.targets.find { |t| t.name == 'App' } or abort 'App target not found'

def group_for(project, name, path)
  project.main_group.find_subpath(name, true).tap { |g| g.set_source_tree('SOURCE_ROOT'); g.set_path(path) }
end

added = []

# Sources compiled into both the app and (later) the widget.
shared = group_for(project, 'Shared', 'Shared')
Dir[File.join(ROOT, 'Shared', '*.swift')].sort.each do |file|
  name = File.basename(file)
  ref = shared.files.find { |f| f.display_name == name } || shared.new_reference(name)
  unless app.source_build_phase.files_references.include?(ref)
    app.add_file_references([ref])
    added << "Shared/#{name}"
  end
end

# The Capacitor plugin lives with the app.
app_group = project.main_group.find_subpath('App', true)
%w[SharedStorePlugin.swift].each do |name|
  ref = app_group.files.find { |f| f.display_name == name } || app_group.new_reference(name)
  unless app.source_build_phase.files_references.include?(ref)
    app.add_file_references([ref])
    added << "App/#{name}"
  end
end

# Entitlements must be referenced by build settings, not just exist on disk.
entitlements = 'App/App.entitlements'
app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = entitlements
end

project.save
puts added.empty? ? 'already wired' : "added: #{added.join(', ')}"
puts "entitlements: #{entitlements}"
