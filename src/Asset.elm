module Asset exposing (Asset, googleLogo, legiswipeLogo, metamaskLogo, toPath)


toPath : Asset -> String
toPath (Asset filename) =
    "/images/" ++ filename


type Asset
    = Asset String


legiswipeLogo : Asset
legiswipeLogo =
    Asset "legiswipe-logo.svg"


googleLogo : Asset
googleLogo =
    Asset "google-logo.svg"


metamaskLogo : Asset
metamaskLogo =
    Asset "metamask-logo.svg"
