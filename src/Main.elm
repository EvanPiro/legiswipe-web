port module Main exposing (Model, Msg(..), init, main, update, view)

import AddressApi
import Asset
import Bill as Bill
import BillMetadata exposing (BillMetadata, BillMetadataRes)
import Browser exposing (UrlRequest)
import Browser.Navigation as Nav
import CongressApi
import Html.Styled exposing (Attribute, Html, a, button, div, img, text, toUnstyled)
import Html.Styled.Attributes exposing (class, css, disabled, href, src)
import Html.Styled.Events exposing (onClick)
import Http as Http exposing (Error(..))
import Json.Encode as Encode
import Route exposing (Route)
import Tailwind.Utilities as T
import Url
import VoteApi
import VoterApi as Voter exposing (Voter)


port getAuthToken : String -> Cmd msg


port connectWallet : String -> Cmd msg


port claimTokens : String -> Cmd msg


port authTokenSuccess : (String -> msg) -> Sub msg


port authTokenFail : (String -> msg) -> Sub msg


port walletError : (String -> msg) -> Sub msg


port walletFound : (String -> msg) -> Sub msg


port claimTokensFail : (String -> msg) -> Sub msg


port claimTokensSuccess : (String -> msg) -> Sub msg



---- MODEL ----


type alias Verdict =
    ( Bill.Model, Bool )


type Auth
    = SignedOut
    | SignInFailed String
    | SigningIn
    | ValidatingAuth String
    | SignedIn Voter


type WalletStatus
    = WalletNotConnected
    | WalletConnecting
    | WalletConnectionError String
    | WalletConnected String


type ClaimTokensStatus
    = NotClaimed
    | Claimed
    | Claiming
    | ClaimFailed String


type RequestedBill
    = BillFound Bill.Model
    | BillLoading
    | BillError
    | BillNotLoaded


type alias Model =
    { activeBill : RequestedBill
    , bills : List BillMetadata
    , verdicts : List Verdict
    , loading : Bool
    , next : String
    , env : Env
    , feedback : String
    , showSponsor : Bool
    , auth : Auth
    , route : Route
    , key : Nav.Key
    , creds : Maybe String
    , wallet : WalletStatus
    , claimTokensStatus : ClaimTokensStatus
    }


type alias Env =
    { apiKey : String, googleClientId : String }


initModel : Env -> Url.Url -> Nav.Key -> Model
initModel env url key =
    { activeBill = BillNotLoaded
    , bills = []
    , verdicts = []
    , loading = True
    , next = ""
    , env = env
    , feedback = ""
    , showSponsor = False
    , auth = SignedOut
    , route = Route.fromUrl url
    , key = key
    , creds = Nothing
    , wallet = WalletNotConnected
    , claimTokensStatus = NotClaimed
    }



-- @Todo come up with better means to force specific state for development


initModel_ : Env -> Url.Url -> Nav.Key -> Model
initModel_ env url key =
    { activeBill = BillNotLoaded
    , bills = []
    , verdicts = []
    , loading = True
    , next = ""
    , env = env
    , feedback = ""
    , showSponsor = False
    , auth = SignedIn Voter.blank
    , route = Route.Home
    , key = key
    , creds = Nothing
    , wallet = WalletNotConnected
    , claimTokensStatus = NotClaimed
    }


init : Env -> Url.Url -> Nav.Key -> ( Model, Cmd Msg )
init env url key =
    let
        cmd =
            case Route.fromUrl url of
                Route.Bill type_ number ->
                    getBillFromIds env.apiKey type_ number

                _ ->
                    getFirstBills env.apiKey
    in
    ( initModel env url key
    , cmd
    )


getFirstBills : String -> Cmd Msg
getFirstBills apiKey =
    Http.get
        { url = CongressApi.url apiKey
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }


getNextBills : String -> String -> Cmd Msg
getNextBills key url =
    Http.get
        { url = CongressApi.addKey key url
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }


encodeVerdict : String -> Verdict -> Encode.Value
encodeVerdict creds ( bill, bool ) =
    Encode.object
        [ ( "verdict", Encode.bool bool )
        , ( "billId", Encode.string <| Bill.toBillId bill )
        , ( "bill", Bill.encode bill )
        , ( "credentials", Encode.string creds )
        ]


logVerdict : String -> Verdict -> Cmd Msg
logVerdict creds verdict =
    Http.post
        { url = VoteApi.path
        , body = Http.jsonBody <| encodeVerdict creds verdict
        , expect = Http.expectWhatever LogRes
        }


getBill : String -> BillMetadata -> Cmd Msg
getBill key { url } =
    Http.get
        { url = CongressApi.addKey key url
        , expect = Http.expectJson GotBill Bill.decoder
        }


getBillFromIds : String -> String -> String -> Cmd Msg
getBillFromIds key type_ number =
    Http.get
        { url = Bill.toJsonFromIds key type_ number
        , expect = Http.expectJson GotBill Bill.decoder
        }



---- UPDATE ----


type Msg
    = UrlChanged Url.Url
    | UrlRequested UrlRequest
    | GotBills (Result Http.Error BillMetadataRes)
    | GotBill (Result Http.Error Bill.BillRes)
    | SetVerdict Bill.Model Bool
    | LogRes (Result Http.Error ())
    | GotVoter (Result Http.Error Voter)
    | SignIn
    | AuthTokenSuccess String
    | AuthTokenFail String
    | ConnectWallet
    | WalletFound String
    | WalletError String
    | GotAddrResp (Result Http.Error AddressApi.Address)
    | ClaimTokens
    | ClaimTokenSuccess String
    | ClaimTokensFail String


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        UrlChanged url ->
            let
                creds =
                    Maybe.withDefault "" model.creds
            in
            case Route.fromUrl url of
                Route.Home ->
                    ( { model | auth = ValidatingAuth creds, route = Route.Home, claimTokensStatus = NotClaimed }, Voter.request GotVoter creds )

                Route.Bill type_ number ->
                    ( { model | route = Route.Bill type_ number }, getBillFromIds model.env.apiKey type_ number )

                route ->
                    ( { model | route = route }, Cmd.none )

        UrlRequested req ->
            let
                cmd =
                    case req of
                        Browser.Internal url ->
                            Nav.pushUrl model.key (Url.toString url)

                        Browser.External str ->
                            Nav.load str
            in
            ( model, cmd )

        SignIn ->
            ( { model | auth = SigningIn }, getAuthToken model.env.googleClientId )

        AuthTokenSuccess token ->
            ( { model | auth = ValidatingAuth token, creds = Just token }, Voter.request GotVoter token )

        AuthTokenFail str ->
            ( { model | auth = SignInFailed str }, Cmd.none )

        -- @Todo store JWT for persistent session after refresh.
        GotVoter res ->
            case res of
                Err _ ->
                    ( { model | auth = SignInFailed "backend error" }, Cmd.none )

                Ok voter ->
                    case ( model.activeBill, model.bills, model.next ) of
                        ( BillFound bill, _, _ ) ->
                            ( { model | auth = SignedIn voter, loading = False }, Cmd.none )

                        ( _, [], "" ) ->
                            ( { model | auth = SignedIn voter }, getFirstBills model.env.apiKey )

                        ( _, _, n ) ->
                            ( { model | auth = SignedIn voter }, getNextBills model.env.apiKey n )

        LogRes res ->
            ( model, Cmd.none )

        GotBills res ->
            case res of
                Err _ ->
                    ( { model | bills = [], next = "", feedback = "Bill request failed. Please try again later." }, Cmd.none )

                Ok metadata ->
                    ( { model | bills = metadata.bills, next = metadata.pagination.next, activeBill = BillLoading }
                    , case List.head metadata.bills of
                        Just bill ->
                            case model.route of
                                Route.Bill type_ number ->
                                    Nav.pushUrl model.key (Route.billIdsToUrl bill.type_ bill.number)

                                _ ->
                                    Cmd.none

                        _ ->
                            Cmd.none
                    )

        GotBill res ->
            case res of
                Err err ->
                    let
                        errorStr =
                            case err of
                                BadBody str ->
                                    str

                                _ ->
                                    "Oops! Looks like we can't find this bill."
                    in
                    ( { model | activeBill = BillError, feedback = errorStr, loading = False }, Cmd.none )

                Ok ok ->
                    let
                        newModel =
                            { model | activeBill = BillFound ok.bill, showSponsor = False }
                    in
                    ( newModel, Cmd.none )

        SetVerdict bill bool ->
            let
                verdict =
                    ( bill, bool )

                newBills =
                    List.filter (\{ number } -> bill.number /= number) model.bills

                reqCmd =
                    case ( List.head newBills, model.next ) of
                        ( Just billMetadata, _ ) ->
                            Nav.pushUrl model.key (Route.billIdsToUrl billMetadata.type_ billMetadata.number)

                        ( _, "" ) ->
                            getFirstBills model.env.apiKey

                        _ ->
                            getNextBills model.env.apiKey model.next

                newModel =
                    { model
                        | bills = newBills
                        , activeBill = BillNotLoaded
                        , loading = True
                        , verdicts = [ verdict ] ++ model.verdicts
                    }
            in
            ( newModel
            , Cmd.batch
                [ reqCmd
                , logVerdict
                    (model.creds
                        |> Maybe.withDefault ""
                    )
                    verdict
                ]
            )

        ConnectWallet ->
            ( { model | wallet = WalletConnecting }, connectWallet "" )

        WalletFound addr ->
            ( { model | wallet = WalletConnected addr }
            , AddressApi.request
                GotAddrResp
                (model.creds
                    |> Maybe.withDefault ""
                )
                addr
            )

        WalletError str ->
            ( { model | wallet = WalletConnectionError str }, Cmd.none )

        GotAddrResp result ->
            case result of
                Ok res ->
                    ( { model | wallet = WalletConnected res.address }, Cmd.none )

                Err _ ->
                    ( { model | wallet = WalletConnectionError "Unapproved wallet" }, Cmd.none )

        ClaimTokens ->
            ( { model | claimTokensStatus = Claiming }, claimTokens "" )

        ClaimTokenSuccess _ ->
            ( { model | claimTokensStatus = Claimed }, Cmd.none )

        ClaimTokensFail str ->
            ( { model | claimTokensStatus = ClaimFailed str }, Cmd.none )



---- VIEW ----


billView : Model -> Html Msg
billView model =
    case model.activeBill of
        BillError ->
            div [ class "mt-1 mx-1 text-center" ]
                [ text model.feedback
                ]

        BillFound bill ->
            div [ class "mt-1 mx-1" ]
                [ authView False "Vote now!" model (\m voter -> yesNo bill)
                , Bill.view model.showSponsor bill
                ]

        _ ->
            div [ class "mt-1 mx-1 text-center" ]
                [ text "Loading bill..."
                ]


view : Model -> Html Msg
view model =
    div [ class "view" ]
        [ div [ class "header", css [ T.text_center ] ] [ a [ href (Route.toUrlString Route.Home) ] [ img [ src (Asset.toPath Asset.legiswipeLogo) ] [] ] ]
        , div [ class "content", css [ T.text_center, T.my_3 ] ]
            [ case model.route of
                Route.Home ->
                    authView True "sign in" model voterView

                Route.Bill _ _ ->
                    billView model

                Route.NotFound ->
                    div [] [ text "Oops! looks like this url is not supported." ]
            ]
        , div [ class "footer" ] []
        ]


voterView : Model -> Voter -> Html Msg
voterView model voter =
    div []
        [ div [] <|
            case model.bills of
                [] ->
                    [ div [] [ text "Looks like you voted on all the bills! Please check for more later" ] ]

                x :: dx ->
                    [ div
                        [ css
                            [ T.my_5
                            , T.px_3
                            ]
                        ]
                        [ text <| "Welcome " ++ voter.firstName ++ "! There are bills awaiting your vote." ]
                    , brandedButton (Just <| Route.billIdsToUrl x.type_ x.number)
                        []
                        []
                        "Vote now"
                    ]
        , case voter.canRedeem of
            0 ->
                div [] []

            _ ->
                redeemView model voter
        ]


authView : Bool -> String -> Model -> (Model -> Voter -> Html Msg) -> Html Msg
authView showTagline btnCopy model authContent =
    let
        tagLine =
            if showTagline then
                div [ css [ T.my_5, T.px_3 ] ] [ text <| "Democracy, one bill at a time." ]

            else
                div [] []
    in
    case model.auth of
        SignedOut ->
            div []
                [ tagLine
                , brandedButton Nothing
                    [ onClick SignIn
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.googleLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                    btnCopy
                ]

        SignedIn voter ->
            authContent model voter

        SignInFailed _ ->
            div []
                [ div [ css [ T.my_5, T.px_3 ] ] [ text "Sign in failed. Please try again." ]
                , brandedButton Nothing
                    [ onClick SignIn
                    ]
                    [ img [ src (Asset.toPath Asset.googleLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                    "Sign in"
                ]

        _ ->
            div []
                [ tagLine
                , brandedButton Nothing
                    [ disabled True
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.googleLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                    "Authenticating..."
                ]


redeemView : Model -> Voter -> Html Msg
redeemView model voter =
    let
        tokens =
            String.fromInt voter.canRedeem

        dialogue =
            div [ css [ T.my_5, T.px_3 ] ] [ text <| "You also have " ++ tokens ++ " tokens to redeem. Claim them now!" ]
    in
    div [] <|
        case model.wallet of
            WalletNotConnected ->
                [ dialogue
                , brandedButton Nothing
                    [ onClick ConnectWallet
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                    "Connect Wallet"
                ]

            WalletConnecting ->
                [ dialogue
                , brandedButton Nothing
                    [ disabled True
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                    "Connecting Wallet"
                ]

            WalletConnectionError err ->
                [ dialogue
                , div []
                    [ brandedButton Nothing
                        [ onClick ConnectWallet
                        , css
                            [ T.px_4
                            , T.py_2
                            ]
                        ]
                        [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                        "Connect Wallet"
                    , div [ css [ T.prose_red, T.text_xs, T.mt_3 ] ] [ text err ]
                    ]
                ]

            WalletConnected addr ->
                [ claimTokensView model voter ]


claimTokensView : Model -> Voter -> Html Msg
claimTokensView model voter =
    let
        tokens =
            String.fromInt voter.canRedeem

        dialogue =
            div [ css [ T.my_5, T.px_3 ] ] [ text <| "You also have " ++ tokens ++ " tokens to redeem. Claim them now!" ]
    in
    case model.claimTokensStatus of
        NotClaimed ->
            div []
                [ dialogue
                , brandedButton Nothing
                    [ onClick ClaimTokens
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                  <|
                    "Claim tokens!"
                ]

        Claimed ->
            div [ css [ T.my_5 ] ] [ text "Tokens claimed successfully!" ]

        Claiming ->
            div []
                [ div [ css [ T.my_5, T.px_3 ] ] [ text <| "Just one moment please" ]
                , brandedButton Nothing
                    [ disabled True
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                  <|
                    "Claiming tokens..."
                ]

        ClaimFailed str ->
            div [ css [ T.my_5, T.px_3 ] ]
                [ dialogue
                , brandedButton Nothing
                    [ onClick ClaimTokens
                    , css
                        [ T.px_4
                        , T.py_2
                        ]
                    ]
                    [ img [ src (Asset.toPath Asset.metamaskLogo), css [ T.text_base, T.mr_3 ] ] [] ]
                  <|
                    "Claim tokens!"
                , div [ css [ T.my_5, T.px_3 ] ] [ text str ]
                ]


yesNo : Bill.Model -> Html Msg
yesNo bill =
    let
        btnStyles =
            css [ T.text_3xl, T.leading_tight, T.px_16, T.py_1 ]
    in
    div [ css [ T.flex, T.justify_between, T.my_7 ] ]
        [ brandedButton Nothing [ onClick <| SetVerdict bill False, btnStyles ] [] "❌"
        , brandedButton Nothing [ onClick <| SetVerdict bill True, btnStyles ] [] "✅"
        ]


footer : Html Msg
footer =
    div [ class "flex" ]
        [ div [] [ a [ href "https://github.com/EvanPiro/legiswipe.com" ] [ text "Source Code" ] ]
        , div [] [ a [ href "https://evanpiro.com" ] [ text "© Evan Piro 2023" ] ]
        ]


brandedButton : Maybe String -> List (Attribute Msg) -> List (Html Msg) -> String -> Html Msg
brandedButton linked attrs nodes str =
    let
        btnAttrs =
            [ css
                [ T.inline_flex
                , T.align_middle
                , T.items_center
                , T.justify_center
                , T.cursor_pointer
                , T.w_48
                , T.h_12
                ]
            ]
                ++ attrs

        btnNodes =
            nodes ++ [ text str ]

        btn =
            button btnAttrs btnNodes
    in
    case linked of
        Nothing ->
            btn

        Just url ->
            a [ href url ] [ btn ]



---- PROGRAM ----


main : Program Env Model Msg
main =
    Browser.application
        { view = view >> toUnstyled >> (\body -> { title = "Legiswipe", body = [ body ] })
        , init = init
        , update = update
        , onUrlRequest = UrlRequested
        , onUrlChange = UrlChanged
        , subscriptions =
            \_ ->
                Sub.batch
                    [ authTokenSuccess AuthTokenSuccess
                    , authTokenFail AuthTokenFail
                    , walletError WalletError
                    , walletFound WalletFound
                    , claimTokensFail ClaimTokensFail
                    , claimTokensSuccess ClaimTokenSuccess
                    ]
        }
