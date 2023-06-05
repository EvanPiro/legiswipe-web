port module Main exposing (Model, Msg(..), init, main, update, view)

import Bill exposing (Bill, BillRes)
import BillMetadata exposing (BillMetadata, BillMetadataRes)
import Browser
import CongressApi
import Html.Styled exposing (Html, a, button, div, h1, img, p, text, toUnstyled)
import Html.Styled.Attributes exposing (class, href, src)
import Html.Styled.Events exposing (onClick)
import Http as Http exposing (Error(..))
import Json.Encode as Encode
import List exposing (head)
import LogApi


port signIn : String -> Cmd msg


port signInSuccess : (String -> msg) -> Sub msg



---- MODEL ----


type alias Verdict =
    ( Bill, Bool )


type Auth
    = SignedOut
    | SignedIn String
    | SigningIn


authToMaybe : Auth -> Maybe String
authToMaybe auth =
    case auth of
        SignedIn cred ->
            Just cred

        _ ->
            Nothing


type alias Model =
    { activeBill : Maybe Bill
    , bills : List BillMetadata
    , verdicts : List Verdict
    , loading : Bool
    , next : String
    , env : Env
    , feedback : String
    , showSponsor : Bool
    , auth : Auth
    }


type alias Env =
    { apiKey : String, googleClientId : String }


init : Env -> ( Model, Cmd Msg )
init env =
    ( { activeBill = Nothing
      , bills = []
      , verdicts = []
      , loading = True
      , next = ""
      , env = env
      , feedback = ""
      , showSponsor = False
      , auth = SignedOut
      }
    , Http.get
        { url = CongressApi.url env.apiKey
        , expect = Http.expectJson GotBills BillMetadata.decoder
        }
    )


getFirstBills : Model -> Cmd Msg
getFirstBills model =
    Http.get
        { url = CongressApi.url model.env.apiKey
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
        , ( "bill", Bill.encode bill )
        , ( "credential", Encode.string creds )
        ]


logVerdict : String -> Verdict -> Cmd Msg
logVerdict creds verdict =
    Http.post
        { url = LogApi.path
        , body = Http.jsonBody <| encodeVerdict creds verdict
        , expect = Http.expectWhatever LogRes
        }



---- UPDATE ----


type Msg
    = GotBills (Result Http.Error BillMetadataRes)
    | GotBill (Result Http.Error BillRes)
    | SetVerdict Bill Bool
    | LogRes (Result Http.Error ())
    | ClearCache
    | ShowSponsor
    | SignIn
    | SignInSuccess String


getBill : String -> BillMetadata -> Cmd Msg
getBill key { url } =
    Http.get
        { url = CongressApi.addKey key url
        , expect = Http.expectJson GotBill Bill.decoder
        }


update : Msg -> Model -> ( Model, Cmd Msg )
update msg model =
    case msg of
        SignIn ->
            ( { model | auth = SigningIn }, signIn model.env.googleClientId )

        SignInSuccess token ->
            ( { model | auth = SignedIn token }, Cmd.none )

        ShowSponsor ->
            ( { model | showSponsor = True }, Cmd.none )

        ClearCache ->
            ( model, getFirstBills model )

        LogRes res ->
            ( model, Cmd.none )

        GotBills res ->
            let
                bills =
                    res
                        |> Result.map (\b -> b.bills)
                        |> Result.withDefault []

                next =
                    res
                        |> Result.map (\b -> b.pagination)
                        |> Result.map (\b -> b.next)
                        |> Result.withDefault ""

                reqCmd =
                    case List.head bills of
                        Just bill ->
                            getBill model.env.apiKey bill

                        _ ->
                            Cmd.none

                newModel =
                    { model | bills = bills, next = next }
            in
            ( newModel, Cmd.batch [ reqCmd ] )

        GotBill res ->
            case res of
                Err err ->
                    let
                        errorStr =
                            case err of
                                BadBody str ->
                                    str

                                _ ->
                                    "other error"
                    in
                    ( { model | feedback = errorStr }, Cmd.none )

                Ok ok ->
                    let
                        newModel =
                            { model | activeBill = Just ok.bill, showSponsor = False }
                    in
                    ( newModel, Cmd.none )

        SetVerdict bill bool ->
            let
                verdict =
                    ( bill, bool )

                newBills =
                    List.filter (\{ number } -> bill.number /= number) model.bills

                reqCmd =
                    case List.head newBills of
                        Just billMetadata ->
                            getBill model.env.apiKey billMetadata

                        _ ->
                            getNextBills model.env.apiKey model.next

                newModel =
                    { model
                        | bills = newBills
                        , activeBill = Nothing
                        , loading = True
                        , verdicts = [ verdict ] ++ model.verdicts
                    }
            in
            ( newModel
            , Cmd.batch
                [ reqCmd
                , logVerdict
                    (model.auth
                        |> authToMaybe
                        |> Maybe.withDefault ""
                    )
                    verdict
                ]
            )



---- VIEW ----


view : Model -> Html Msg
view model =
    div [ class "full-frame" ]
        [ case model.activeBill of
            Nothing ->
                div [ class "mt-1 mx-1 text-center" ]
                    [ text "Loading bill..."
                    , div [ class "mt-1" ] [ button [ onClick ClearCache ] [ text "Reset" ] ]
                    ]

            Just bill ->
                div [ class "mt-1 mx-1" ]
                    [ yesNo bill
                    , Bill.view ShowSponsor model.showSponsor bill
                    , logInButton model
                    ]
        , div [ class "flex" ]
            [ div [] [ a [ href "https://github.com/EvanPiro/legiswipe.com" ] [ text "Source Code" ] ]
            , div [] [ a [ href "https://evanpiro.com" ] [ text "© Evan Piro 2023" ] ]
            ]
        ]


logInButton : Model -> Html Msg
logInButton model =
    case model.auth of
        SignedOut ->
            div [ class "mt-2" ] [ button [ onClick SignIn ] [ text "Log in" ] ]

        SignedIn _ ->
            div [] []

        SigningIn ->
            div [] [ text "signing in" ]


yesNo : Bill -> Html Msg
yesNo bill =
    div [ class "flex" ]
        [ button [ class "btn", onClick <| SetVerdict bill False ] [ text "❌" ]
        , button [ class "btn", onClick <| SetVerdict bill True ] [ text "✅" ]
        ]



---- PROGRAM ----


main : Program Env Model Msg
main =
    Browser.element
        { view = view >> toUnstyled
        , init = init
        , update = update
        , subscriptions = always <| signInSuccess SignInSuccess
        }
