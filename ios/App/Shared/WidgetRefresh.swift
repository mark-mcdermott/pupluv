import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

public enum WidgetRefresh {
    public static func reload() {
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadTimelines(ofKind: "PupluvPlaceWidget")
        }
        #endif
    }
}
