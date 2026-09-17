# The widget needs iOS 17 for interactive App Intents, and the Capacitor SPM
# package already builds at 17 — leaving the app at 15 only produced a linker
# warning about mismatched minimums.
require 'xcodeproj'

project = Xcodeproj::Project.open(File.expand_path('../iphone/App/App.xcodeproj', __dir__))
project.targets.each do |target|
  target.build_configurations.each do |config|
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  end
end
project.build_configurations.each do |config|
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
end
project.save
puts 'deployment target raised to 17.0 across all targets'
